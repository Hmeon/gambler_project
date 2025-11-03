
# 🎴 Project Gambler — **Baccarat (Punto Banco)**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Status](https://img.shields.io/badge/status-active-brightgreen)
![Three.js](https://img.shields.io/badge/three.js-r128-000000)
![Rendering](https://img.shields.io/badge/Rendering-ACES%20Tone%20Mapping%20%7C%20Soft%20Shadows-informational)
![Rules](https://img.shields.io/badge/Rules-Punto%20Banco%20(8%20decks)%20✓-purple)

> A modern, rule-accurate **Baccarat (Punto Banco)** web game with **3D chips**, **secure shuffle**, and **polished UI**—built for portfolio-quality code and open-source collaboration.

---

## Table of Contents
- [Overview (EN)](#overview-en)
- [개요 (KR)](#개요-kr)
- [Features](#features)
- [Screenshots](#screenshots)
- [Live & Local Run](#live--local-run)
- [Directory Structure](#directory-structure)
- [Configuration](#configuration)
- [Game Rules (Exact)](#game-rules-exact)
- [Tech Notes](#tech-notes)
- [Troubleshooting](#troubleshooting)
- [Performance Tips](#performance-tips)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Credits](#credits)

---

## Overview (EN)

**Project Gambler — Baccarat** is a single‑page web game that accurately implements **international Punto Banco rules**:

- Player/Banker third‑card drawing rules implemented exactly (including the Banker’s conditional draw table).
- **Tie push** is honored for Player/Banker main bets (you don’t lose main bets on a tie).
- **Banker commission** (5%) supported, plus optional **No‑Commission (Banker 6 pays 1:2)** mode.
- Default **Tie payout** is **8:1** (configurable).
- **8‑deck shoe** with **Fisher–Yates shuffle** driven by **CSPRNG** (crypto.getRandomValues) + **rejection sampling** to remove modulo bias.
- **Burn card** on new shoe (first card’s value; 10/J/Q/K count as 10) and **conservative cut‑card** (~16 cards remaining).

For visuals, it renders **3D betting chips** on a pixel‑perfect overlay using **Three.js**, **ACES tone mapping**, **sRGB**, **soft shadows**, and **high‑quality textures**. Chips **stack** on the betting spots with a **fall‑and‑bounce** animation and are **cleared** when a round result is recorded.

---

## 개요 (KR)

**Project Gambler — 바카라**는 **국제 표준 Punto Banco 규칙**을 정확히 구현한 **웹 게임**입니다.

- 플레이어/뱅커 **3카드 규칙**(특히 뱅커 조건부 드로우 테이블) **정확 구현**  
- **무승부(Tie)** 시 플레이어/뱅커 **본선 베팅 푸시**(환불) 적용  
- **뱅커 수수료 5%** 및 **No‑Commission(뱅커 6 승리 1:2)** 옵션 지원  
- 기본 **타이 배당 8:1**(설정 가능)  
- **8덱 슈** + **Fisher–Yates 셔플**(CSPRNG 기반, **거절 샘플링**으로 모듈러 바이어스 제거)  
- 신규 슈 시작 시 **번 카드**(첫 카드의 값만큼, 10/J/Q/K=10), **컷카드 근사**(~16장 남을 때 재셔플)

시각적으로는 **Three.js** 기반 **3D 칩**을 테이블 위에 **픽셀 정합 오버레이**로 렌더링하며, **ACES 톤매핑**, **sRGB**, **소프트 섀도**, **고품질 텍스처**를 적용합니다. 칩은 추가 시 **낙하→바운스** 애니메이션으로 **자연스럽게 쌓이고**, 라운드 결과가 기록되면 **자동 정리**됩니다.

---

## Features

### 🎮 Game
- ✅ Exact **Punto Banco** rules (Player ≤5 draws; naturals 8/9 stand; full Banker table).  
- 🔁 **Tie push** for main bets; **Pair** side bets (first two cards) default payout **11:1**.  
- 💸 **Banker commission** 5% (or **No‑Commission** with Banker‑6 pays 1:2).  
- 🎲 **8‑deck** shoe, **secure shuffle** (Fisher–Yates + CSPRNG + rejection sampling).  
- 🔥 **Burn card** at shoe start; **cut‑card** approximation (~16 cards).

### 🎨 Rendering & UX
- 🧩 **3D chip overlay** aligned to DOM betting areas (pixel‑perfect, resize‑safe).  
- 🌈 **sRGB + ACES tone mapping** and **soft shadows** (PCFSoft).  
- 🪙 **Stacking animation**: fall → bounce → settle (no physics jitter).  
- 🧭 Clean UI with round result panel and live chip/fund display.

---

## Screenshots

> Replace these with your actual screenshots once available:
```
images/screenshot-table.png
images/screenshot-chips.png
images/screenshot-result.png
```
```md
![Table](images/board.svg)
![Chips](images/screenshot-chips.png)
![Result](images/screenshot-result.png)
```

---

## Live & Local Run

This project **must be served over http(s)** for chips/textures to load correctly. Opening the HTML via `file://` can be blocked by browser security.

### Option A — Node http-server (recommended)
```bash
# from project root
npx http-server -c-1 --cors
# open the printed URL, e.g. http://127.0.0.1:8080/Baccarat.html
```

### Option B — Python (built-in)
```bash
# Python 3
python -m http.server 8080
# then open: http://127.0.0.1:8080/Baccarat.html
```

---

## Directory Structure

```
project-root/
├─ Baccarat.html
├─ main.html
├─ css/
│  └─ baccarat_style.css
├─ js/
│  ├─ baccarat_script.js       # rules, shoe, payouts, UI state
│  └─ floor.js                 # 3D chip overlay (pixel-accurate, HQ, stacking)
├─ images/                     # chip textures, UI assets
├─ card/                       # playing card SVGs (cl/sp/ht/di + rank)
├─ fonts/, icon/
├─ .vscode/                    # (included intentionally; optional)
└─ README.md
```

---

## Configuration

All toggles live in `js/baccarat_script.js`:

```js
// decks & payouts
const NUMBER_OF_DECKS = 8;
const TIE_PAYOUT = 8;                 // Tie pays 8:1 (set 9 for 9:1 tables)
const noCommission = false;           // true → Banker-6 pays 1:2 (No-Commission)

// shoe management
const MIN_CARDS_BEFORE_NEW_SHOE = 16; // auto new shoe when fewer remain
```

Rendering quality in `js/floor.js` (HQ variant): shadow resolution, tone mapping exposure, chip geometry segments are documented in comments and can be tuned for performance.

---

## Game Rules (Exact)

### Player
- **Natural 8/9**: both stand, no third card.
- Otherwise: **Player total ≤ 5 → draw one card**; **6/7 → stand**.

### Banker (conditional on Player’s third card point value 0–9)
- Banker **0–2** → draw.  
- Banker **3** → draw **unless** Player’s third card is **8**.  
- Banker **4** → draw if Player’s third card ∈ **{2,3,4,5,6,7}**.  
- Banker **5** → draw if Player’s third card ∈ **{4,5,6,7}**.  
- Banker **6** → draw if Player’s third card ∈ **{6,7}**.  
- Banker **7** → stand.

> **Note**: Player’s third card **point** is **0–9** with 10/J/Q/K = 0 (not 10/11/12/13).

### Settlements
- **Player/Banker** main bets pay **1:1** on win; **push on Tie**.  
- **Tie** pays **8:1** by default (configurable).  
- **Banker commission**: 5% on winnings (or No‑Commission: **Banker‑6 pays 1:2**).  
- **Pair** (PlayerPair/BankerPair): win if the **first two cards** form a pair; default **11:1** (paid as 12× including stake).

---

## Tech Notes

### Secure Shuffle
- **Fisher–Yates** (aka Knuth) shuffle guarantees unbiased permutations **if** the RNG is uniform.
- Uses **`crypto.getRandomValues`** when available; falls back to high‑range `Math.random` with **rejection sampling** to remove modulo bias.
- **8‑deck shoe**; on new shoe, **burn** the first card’s value (10/J/Q/K → 10).

### 3D Chips & Overlay
- **Orthographic camera** aligned to **overlay pixel size**, centered at table overlay for perfect DOM↔world mapping.
- **Soft shadows** via `ShadowMaterial` floor; **ACES tone mapping** + **sRGB** color management.
- **Stacking FX**: per‑chip tween (no physics jitter) with **fall → bounce → settle**.

### Result & Lifecycle
- A **MutationObserver** clears chips when a new round result is appended to `#gameHistory` (so chips reflect only the current round).

---

## Troubleshooting

- **Chips not visible**  
  - Serve over **http(s)** (not `file://`).
  - Ensure `#chip-overlay` exists (the script will auto‑create if missing).  
  - Check browser console for CDN errors (three.js, cannon).

- **Chips misaligned after resize**  
  - The overlay listens for resize and recomputes DOM centers; ensure your layout doesn’t absolutely reposition betting buttons without triggering reflow.

- **Large assets push failure**  
  - GitHub rejects files **> 100 MB**. Track binaries with **Git LFS**.

---

## Performance Tips

- Lower shadow map size: `2048 → 1024`.
- Reduce cylinder segments: `128 → 96` (or 64).
- Tone mapping exposure: `0.9–1.2` range.
- Anisotropy lower on low‑end GPUs.

---

## Roadmap
- [ ] Dealer voice/SFX (chip drop, flip).  
- [ ] Result bead‑plate & big‑road visualizer.  
- [ ] Options panel (Tie payout, commission mode).  
- [ ] Unit tests for shoe & draw logic.  
- [ ] Mobile layout refinements.

---

## Contributing

Contributions are welcome!

1. **Fork** the repository.
2. Create feature branch: `git checkout -b feat/your-feature`  
3. Commit with **Conventional Commits** style: `feat: add X` / `fix: correct banker rule input`  
4. **Rebase** onto `main` before opening PR:  
   ```bash
   git fetch origin && git rebase origin/main
   ```
5. Open a PR with a clear description and, if relevant, screenshots or short clips.

---

## License

Unless otherwise noted in subdirectories (e.g., card assets), the project is released under the **MIT License**. See [`LICENSE`](LICENSE).  
> If you include third‑party card/texture assets, ensure you have rights to redistribute them and note any separate licenses.

---

## Credits

- **Baccarat rules** reference: standard **Punto Banco** (casino) rules.  
- **Three.js** for rendering; **Cannon.js** (optional in earlier versions); custom tweens for stacking FX.  
- Thanks to open‑source contributors and libraries used in this project.

---

> _If you find this useful, star the repo and share feedback. Enjoy the game!_
