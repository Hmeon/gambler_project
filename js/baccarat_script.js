/* baccarat_script.js (Final, Rules-Accurate, Audited)
 * - Correct Punto Banco rules (Player/Banker third-card, Tie push, Pair)
 * - Secure/unbiased shuffle (Fisher–Yates + CSPRNG + rejection sampling)
 * - Initial shoe burn & conservative cut-card approximation
 * - Allow one MAIN bet (Player/Banker/Tie) + SIDE bets concurrently
 * - Monetary rounding to cents to avoid drift
 */

'use strict';

// ===================== CONFIG / CONSTANTS =====================
// Suits: clubs, spades, hearts, diamonds (asset naming unchanged)
const SUITS = ['cl', 'sp', 'ht', 'di'];
// Ranks 1..13 (Ace=1, 2..9, 10=10, 11=J, 12=Q, 13=K)
const RANKS = Array.from({ length: 13 }, (_, i) => i + 1);

// Chip images/values (display only; fractional cents는 칩으로 표시하지 않음)
const CHIP_DENOMINATIONS = [
  { value: 10000, image: 'images/brown_chip.png' },
  { value: 5000,  image: 'images/purple_chip.png' },
  { value: 1000,  image: 'images/black_chip.png' },
  { value: 500,   image: 'images/green_chip.png' },
  { value: 100,   image: 'images/blue_chip.png' },
  { value: 50,    image: 'images/yellow_chip.png' },
  { value: 10,    image: 'images/red_chip.png' },
  { value: 5,     image: 'images/cyan_chip.png' },
  { value: 1,     image: 'images/white_chip.png' },
];

// Table options
const NUMBER_OF_DECKS = 8;         // 일반적으로 6~8, 표준 8덱
const TIE_PAYOUT = 8;              // 8:1 (많은 카지노 기본). 9:1 테이블이면 9로 변경
const noCommission = false;        // true: Banker 6 승리시 1:2 지급(수수료 없음 변형)

// Cut-card 근사: 남은 장 수가 이 값 미만이면 새 슈 생성
const MIN_CARDS_BEFORE_NEW_SHOE = 16; // Wizard of Odds: cut card는 보통 바닥 16장 근처

// ===================== STATE =====================
let deck = [];
let playerHand = [];
let bankerHand = [];
let playerFunds = 0;

// 베팅: MAIN(하나만) + SIDE(동시 허용)
const MAIN_BETS = ['Player', 'Banker', 'Tie'];
const SIDE_BETS = ['PlayerPair', 'BankerPair'];

let activeMainBet = null; // 현재 선택된 본선 베팅 한 종류만 허용
let fixedBetAmount = 100;

let currentBets = {
  Player: 0,
  Banker: 0,
  Tie: 0,
  PlayerPair: 0,
  BankerPair: 0,
};

// ===================== DOM =====================
const bettingUnitButtons = document.querySelectorAll('.betting-unit');
const playButton        = document.getElementById('playButton');
const gameResultDiv     = document.getElementById('gameResult');
const playerCardSumSpan = document.getElementById('playerCardSum');
const bankerCardSumSpan = document.getElementById('bankerCardSum');
const resetButton       = document.getElementById('CleanButton');

const betButtons = {
  Player:     document.getElementById('playerArea'),
  Banker:     document.getElementById('bankerArea'),
  Tie:        document.getElementById('tieArea'),
  PlayerPair: document.getElementById('playerPairArea'),
  BankerPair: document.getElementById('bankerPairArea'),
};

// ===================== UTIL: MONEY/PRNG =====================
function roundToCents(n) {
  // 소수점 오차 방지: 센트 단위 반올림
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function hasCrypto() {
  try {
    // 브라우저: globalThis.crypto / Node: require('node:crypto').webcrypto
    if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') return globalThis.crypto;
    if (typeof require === 'function') {
      const { webcrypto } = require('node:crypto');
      if (webcrypto && typeof webcrypto.getRandomValues === 'function') return webcrypto;
    }
  } catch (_) { /* ignore */ }
  return null;
}

/** 0 <= result < max 의 균등정수. CSPRNG + 거절샘플링으로 모듈로 바이어스 제거 */
function randomInt(max) {
  if (max <= 0) return 0;
  const cryptoObj = hasCrypto();
  if (cryptoObj) {
    const lim = Math.floor(0x100000000 / max) * max; // 2^32 기반
    const buf = new Uint32Array(1);
    let r;
    do {
      cryptoObj.getRandomValues(buf);
      r = buf[0];
    } while (r >= lim);
    return r % max;
  }
  // Fallback: Math.random() 기반 거절 샘플링 (충분히 큰 범위)
  const BIG = 0x1_0000_0000; // 2^32
  const lim = Math.floor(BIG / max) * max;
  let r;
  do {
    r = Math.floor(Math.random() * BIG);
  } while (r >= lim);
  return r % max;
}

// ===================== SHOE / SHUFFLE =====================
function buildShoe() {
  const shoe = [];
  for (let d = 0; d < NUMBER_OF_DECKS; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        shoe.push({ suit, value: rank, image: `card/${suit}${rank}.svg` });
      }
    }
  }
  return shoe;
}

/** Fisher–Yates (Knuth) Shuffle — 무편향, CSPRNG 사용 */
function shuffleDeck(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 신규 슈(덱) 생성 + 셔플 + 번카드(첫 카드 값만큼, 10/J/Q/K=10) */
function createDeck() {
  deck = shuffleDeck(buildShoe());

  // 번카드 규정: 첫 카드 오픈 값만큼 소각, 10/J/Q/K는 10장
  // (UI 상 오픈 연출은 생략하고 로직만 반영)
  if (deck.length > 0) {
    const first = deck.pop(); // 첫 카드
    const burnCount = getCardValue(first.value) || 10; // 0이면 10으로 처리
    for (let i = 0; i < burnCount && deck.length > 0; i++) deck.pop();
  }
}

/** 컷카드 근사: 남은 장이 임계치 미만이면 새 슈 */
function needNewShoe() {
  return deck.length < MIN_CARDS_BEFORE_NEW_SHOE;
}

// ===================== GAME INIT / UI =====================
function initializeGame() {
  // $1,000 ~ $10,000
  playerFunds = Math.floor(Math.random() * 9001) + 1000;
  resetGame();
  updateUI();
  const gh = document.getElementById('gameHistory');
  if (gh) gh.innerHTML = '';
}

function updateUI() {
  const fundsDisplay = document.getElementById('playerFund');
  if (fundsDisplay) {
    fundsDisplay.innerText = `$${playerFunds.toLocaleString(undefined, {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    })}`;
  }
  displayFundsAsChips();

  const totalCurrentBets = Object.values(currentBets).reduce((a, b) => a + b, 0);
  const disableAll = playerFunds < fixedBetAmount || playerFunds <= 0;

  toggleBettingButtons(disableAll);
  // 플레이 버튼: 베팅이 있어야 진행 가능
  if (playButton) playButton.disabled = totalCurrentBets === 0;
}

function displayFundsAsChips() {
  let amountWhole = Math.floor(playerFunds); // 센트(소수)는 칩으로 표현 안 함
  const chips = [];
  for (const denom of CHIP_DENOMINATIONS) {
    const count = Math.floor(amountWhole / denom.value);
    if (count > 0) {
      chips.push({ image: denom.image, count });
      amountWhole -= denom.value * count;
    }
  }
  const fundsChipsDisplay = document.getElementById('fundsChipsDisplay');
  if (fundsChipsDisplay) {
    fundsChipsDisplay.innerHTML = '';
    chips.forEach(c => {
      const div = document.createElement('div');
      div.className = 'chip-display';
      div.innerHTML = `<img src="${c.image}" class="chip-image"><span class="chip-count">x${c.count}</span>`;
      fundsChipsDisplay.appendChild(div);
    });
  }
}

function toggleBettingButtons(disableAll) {
  Object.entries(betButtons).forEach(([type, btn]) => {
    if (!btn) return;
    if (disableAll) {
      btn.disabled = true;
      return;
    }
    // 본선은 1종류만 허용, 사이드는 항상 허용
    if (MAIN_BETS.includes(type)) {
      btn.disabled = !!(activeMainBet && activeMainBet !== type);
    } else {
      btn.disabled = false;
    }
  });
}

function showWarning(message) {
  if (!gameResultDiv) return;
  gameResultDiv.innerText = message;
  gameResultDiv.className = 'alert alert-danger fade-in';
  gameResultDiv.style.display = 'block';
  setTimeout(() => {
    gameResultDiv.classList.remove('fade-in');
    gameResultDiv.style.display = 'none';
  }, 3000);
}

// ===================== DEAL / TOTALS =====================
function dealCards() {
  if (needNewShoe()) createDeck();
  playerHand = [deck.pop(), deck.pop()];
  bankerHand = [deck.pop(), deck.pop()];
  revealCards();
}

function getCardValue(rank) {
  // Ace=1, 2..9=pips, 10/J/Q/K=0 (바카라 점수)
  return rank >= 10 ? 0 : rank;
}

function calculateHandTotal(hand) {
  const total = hand.reduce((sum, c) => sum + getCardValue(c.value), 0);
  return total % 10;
}

function revealCards() {
  const playerSlots = [
    document.getElementById('playerCardSlot1'),
    document.getElementById('playerCardSlot2'),
    document.getElementById('playerCardSlot3'),
  ];
  const bankerSlots = [
    document.getElementById('bankerCardSlot1'),
    document.getElementById('bankerCardSlot2'),
    document.getElementById('bankerCardSlot3'),
  ];
  playerHand.forEach((card, i) => {
    if (playerSlots[i]) {
      playerSlots[i].style.backgroundImage = `url(${card.image})`;
      playerSlots[i].classList.add('flip');
    }
  });
  bankerHand.forEach((card, i) => {
    if (bankerSlots[i]) {
      bankerSlots[i].style.backgroundImage = `url(${card.image})`;
      bankerSlots[i].classList.add('flip');
    }
  });
  updateCardSums();
}

function updateCardSums() {
  if (playerCardSumSpan) playerCardSumSpan.innerText = calculateHandTotal(playerHand);
  if (bankerCardSumSpan) bankerCardSumSpan.innerText = calculateHandTotal(bankerHand);
}

// ===================== THIRD-CARD RULES =====================
/** Wizard of Odds Banker drawing table 구현 (플레이어 3번째 카드 점수 0–9 사용) */
function shouldBankerDraw(bankerTotal, playerThirdPoint) {
  switch (bankerTotal) {
    case 0:
    case 1:
    case 2: return true;
    case 3: return playerThirdPoint !== 8;
    case 4: return [2, 3, 4, 5, 6, 7].includes(playerThirdPoint);
    case 5: return [4, 5, 6, 7].includes(playerThirdPoint);
    case 6: return [6, 7].includes(playerThirdPoint);
    default: return false; // 7: 스탠드, 8/9는 Natural 처리에서 이미 반환
  }
}

/** 플레이어/뱅커 3카드 분배 결정 */
function determineThirdCard() {
  const playerTotal2 = calculateHandTotal(playerHand);
  const bankerTotal2 = calculateHandTotal(bankerHand);

  // Natural(8/9) 은 즉시 스탠드 (둘 다)
  if ([8, 9].includes(playerTotal2) || [8, 9].includes(bankerTotal2)) return;

  // Player 규칙
  const playerDraws = (playerTotal2 <= 5);
  if (playerDraws) playerHand.push(deck.pop());

  // Banker 규칙
  let bankerDraws = false;
  if (!playerDraws) {
    // 플레이어가 서면(6/7), 뱅커는 합계 0–5에서 드로우
    bankerDraws = (bankerTotal2 <= 5);
  } else {
    const playerThirdPoint = getCardValue(playerHand[2].value); // ★ 핵심 수정: rank%10 이 아님
    bankerDraws = shouldBankerDraw(bankerTotal2, playerThirdPoint);
  }
  if (bankerDraws) bankerHand.push(deck.pop());
}

// ===================== PAYOUTS / COMMISSION =====================
function calculateCommission(betAmount, bankerFinalTotal) {
  if (noCommission) {
    // No-Commission: Banker가 6으로 승리하면 1:2 지급(= 0.5배 감액)
    return bankerFinalTotal === 6 ? roundToCents(betAmount * 0.5) : 0;
  }
  // 커미션 5% (Banker 승리시에만)
  return roundToCents(betAmount * 0.05);
}

function determineFinalResult() {
  const playerTotal = calculateHandTotal(playerHand);
  const bankerTotal = calculateHandTotal(bankerHand);

  let result;
  if (playerTotal > bankerTotal) result = 'Player';
  else if (playerTotal < bankerTotal) result = 'Banker';
  else result = 'Tie';

  updateCardSums();
  settleBets(result, bankerTotal);
}

function settleBets(result, bankerTotal) {
  let payout = 0;
  let resultText = '';

  const totalBetBefore = Object.values(currentBets).reduce((a, b) => a + b, 0);

  // Pair (첫 두 장 기준)
  const playerPair = playerHand[0].value === playerHand[1].value;
  const bankerPair = bankerHand[0].value === bankerHand[1].value;

  // ---- MAIN BETS ----
  // Player
  if (currentBets.Player > 0) {
    if (result === 'Player') {
      payout += currentBets.Player * 2;
      resultText += `Player 승리: +$${(currentBets.Player).toFixed(2)}<br>`;
    } else if (result === 'Tie') {
      payout += currentBets.Player; // Push
      resultText += `Player 베팅 푸시(Tie): 환불 $${(currentBets.Player).toFixed(2)}<br>`;
    } else {
      resultText += `Player 베팅 패배: -$${(currentBets.Player).toFixed(2)}<br>`;
    }
  }

  // Banker
  if (currentBets.Banker > 0) {
    if (result === 'Banker') {
      const commission = calculateCommission(currentBets.Banker, bankerTotal);
      payout += currentBets.Banker * 2 - commission; // 원금+수익-커미션
      const netWin = roundToCents(currentBets.Banker - commission);
      resultText += `Banker 승리: +$${netWin.toFixed(2)}${commission > 0 ? ` (수수료 -$${commission.toFixed(2)})` : ''}<br>`;
    } else if (result === 'Tie') {
      payout += currentBets.Banker; // Push
      resultText += `Banker 베팅 푸시(Tie): 환불 $${(currentBets.Banker).toFixed(2)}<br>`;
    } else {
      resultText += `Banker 베팅 패배: -$${(currentBets.Banker).toFixed(2)}<br>`;
    }
  }

  // Tie
  if (currentBets.Tie > 0) {
    if (result === 'Tie') {
      payout += currentBets.Tie * (TIE_PAYOUT + 1); // 원금 + TIE_PAYOUT배 순이익
      resultText += `Tie 적중: +$${(currentBets.Tie * TIE_PAYOUT).toFixed(2)} (배당 ${TIE_PAYOUT}:1)<br>`;
    } else {
      resultText += `Tie 베팅 패배: -$${(currentBets.Tie).toFixed(2)}<br>`;
    }
  }

  // ---- SIDE BETS ----
  if (currentBets.PlayerPair > 0) {
    if (playerPair) {
      payout += currentBets.PlayerPair * 12; // 11:1 (표준은 11:1 -> 원금 포함 12배)
      resultText += `Player Pair 적중: +$${(currentBets.PlayerPair * 11).toFixed(2)}<br>`;
    } else {
      resultText += `Player Pair 패배: -$${(currentBets.PlayerPair).toFixed(2)}<br>`;
    }
  }

  if (currentBets.BankerPair > 0) {
    if (bankerPair) {
      payout += currentBets.BankerPair * 12; // 11:1
      resultText += `Banker Pair 적중: +$${(currentBets.BankerPair * 11).toFixed(2)}<br>`;
    } else {
      resultText += `Banker Pair 패배: -$${(currentBets.BankerPair).toFixed(2)}<br>`;
    }
  }

  payout = roundToCents(payout);
  playerFunds = roundToCents(playerFunds + payout);

  // 순이익 = (라운드 종료 시 자금 변화) = payout - totalBetBefore
  const netProfit = roundToCents(payout - totalBetBefore);

  displayGameResult(resultText, netProfit);
  checkGameOver();
  updateUI();
}

// ===================== BETTING =====================
function isMainBet(type) { return MAIN_BETS.includes(type); }

function placeBet(betType) {
  // 본선: 하나만 유지
  if (isMainBet(betType)) {
    if (activeMainBet === null) {
      activeMainBet = betType;
      disableOtherMainBettingButtons(betType);
    } else if (activeMainBet !== betType) {
      return; // 다른 본선 배팅 불가
    }
  }

  if (playerFunds < fixedBetAmount) {
    showWarning('자금이 부족합니다.');
    return;
  }

  playerFunds = roundToCents(playerFunds - fixedBetAmount);
  currentBets[betType] += fixedBetAmount;
  triggerAnimation(betButtons[betType], 'active');
  updateUI();
}

function disableOtherMainBettingButtons(selected) {
  Object.entries(betButtons).forEach(([type, btn]) => {
    if (!btn) return;
    if (isMainBet(type) && type !== selected) btn.disabled = true;
  });
}

function triggerAnimation(element, animationClass) {
  if (!element) return;
  element.classList.remove(animationClass);
  void element.offsetWidth;
  element.classList.add(animationClass);
  element.addEventListener('transitionend', function handleTransitionEnd() {
    element.classList.remove(animationClass);
    element.removeEventListener('transitionend', handleTransitionEnd);
  });
}

// ===================== ROUND LIFECYCLE =====================
function displayGameResult(resultHTML, netProfit) {
  const gameHistory = document.getElementById('gameHistory');
  if (gameHistory) {
    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.innerHTML = resultHTML + `<strong>순이익: ${netProfit >= 0 ? '+' : ''}$${netProfit.toFixed(2)}</strong>`;
    gameHistory.prepend(li);
  }

  if (!gameResultDiv) return;
  const cls = netProfit > 0 ? 'alert-success' : (netProfit === 0 ? 'alert-info' : 'alert-danger');
  gameResultDiv.className = `alert ${cls} fade-in`;
  gameResultDiv.innerHTML = resultHTML + `<hr><strong>이번 라운드 순이익: ${netProfit >= 0 ? '+' : ''}$${netProfit.toFixed(2)}</strong>`;
  gameResultDiv.style.display = 'block';
}

function checkGameOver() {
  const totalCurrentBets = Object.values(currentBets).reduce((a, b) => a + b, 0);
  if (playerFunds <= 0 && totalCurrentBets === 0) {
    playerFunds = 0;
    updateUI();
    alert('베팅 금액이 0이 되었습니다. 게임을 종료합니다.');
    if (playButton) playButton.disabled = true;
    toggleBettingButtons(true);
    if (resetButton) resetButton.disabled = true;
  }
}

function resetBets() {
  currentBets = { Player: 0, Banker: 0, Tie: 0, PlayerPair: 0, BankerPair: 0 };
  activeMainBet = null;
  Object.values(betButtons).forEach(btn => { if (btn) btn.classList.remove('active'); });
  toggleBettingButtons(false); // 다시 활성화
  updateUI();
}

function collectCards(callback) {
  const cardSlots = document.querySelectorAll('.card-slot');
  let done = 0;
  cardSlots.forEach(slot => {
    slot.classList.add('tinUpOut');
    slot.addEventListener('animationend', function handle() {
      slot.classList.remove('tinUpOut', 'flip');
      slot.removeEventListener('animationend', handle);
      done++;
      if (done === cardSlots.length && typeof callback === 'function') callback();
    });
  });
}

function prepareNewGame() {
  const cardSlots = document.querySelectorAll('.card-slot');
  cardSlots.forEach(slot => {
    slot.style.backgroundImage = 'url(card/back.svg)';
    slot.classList.add('tinUpIn');
    slot.addEventListener('animationend', function handle() {
      slot.classList.remove('tinUpIn');
      slot.removeEventListener('animationend', handle);
    });
  });
}

function resetGame() {
  collectCards(() => {
    playerHand = [];
    bankerHand = [];
    if (playerCardSumSpan) playerCardSumSpan.innerText = '0';
    if (bankerCardSumSpan) bankerCardSumSpan.innerText = '0';
    if (gameResultDiv) { gameResultDiv.style.display = 'none'; gameResultDiv.innerHTML = ''; }
    resetBets();
    prepareNewGame();
  });
}

function undoBets() {
  playerFunds = roundToCents(playerFunds + Object.values(currentBets).reduce((a, b) => a + b, 0));
  resetBets();
  updateUI();
}

// ===================== EVENT WIRING =====================
function setupEventListeners() {
  bettingUnitButtons.forEach((button) => {
    button.addEventListener('click', function () {
      bettingUnitButtons.forEach((btn) => btn.classList.remove('active'));
      this.classList.add('active');
      fixedBetAmount = parseInt(this.getAttribute('data-unit'), 10);
      updateUI();
    });
  });

  Object.entries(betButtons).forEach(([betType, button]) => {
    if (!button) return;
    button.addEventListener('click', () => placeBet(betType));
  });

  if (playButton) {
    playButton.addEventListener('click', () => {
      if (Object.values(currentBets).every((bet) => bet === 0)) {
        showWarning('최소 한 개 이상의 베팅을 선택하세요.');
        return;
      }

      playButton.disabled = true;
      if (resetButton) resetButton.disabled = true;
      toggleBettingButtons(true);
      dealCards();

      setTimeout(() => {
        determineThirdCard();
        revealCards();

        setTimeout(() => {
          determineFinalResult();

          setTimeout(() => {
            resetGame();
            playButton.disabled = false;
            if (resetButton) resetButton.disabled = false;
            updateUI();
          }, 2000);
        }, 2000);
      }, 2000);
    });
  }

  if (resetButton) resetButton.addEventListener('click', undoBets);
}

// ===================== BOOT =====================
function init() {
  createDeck();       // 신규 슈(셔플+번카드)
  initializeGame();   // 자금 세팅/리셋
  setupEventListeners();
}

window.onload = init;
