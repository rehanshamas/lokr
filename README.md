# Polkalokr — Lokr Smart Contracts

Lokr is a modular, upgradeable on-chain **token-locking and vesting protocol** for EVM-compatible
chains. A single on-chain factory deploys self-contained "Lock" instances, each assembled from
pluggable modules that independently control *who* receives tokens, *how* tokens unlock over time,
and *how* locked positions can be split or transferred. Every locked position is represented as an
ERC-721 NFT, making vesting allocations composable, tradeable, and easy to track.

> License: **BUSL-1.1** (Business Source License 1.1)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
  - [Core modules](#core-modules)
  - [Module variants](#module-variants)
  - [Lifecycle of a lock](#lifecycle-of-a-lock)
  - [Upgradeability & access control](#upgradeability--access-control)
  - [Deploy fees](#deploy-fees)
- [Tech Stack](#tech-stack)
- [Repository Layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Building & Testing](#building--testing)
- [Deployment](#deployment)
- [Supported Networks](#supported-networks)
- [Security Notes](#security-notes)
- [License](#license)

---

## Overview

Lokr lets a project lock ERC-20 tokens for a set of beneficiaries and release them according to a
configurable schedule (linear vesting, fixed intervals, calendar dates, equal tranches, or an
externally triggered event). Rather than being a single monolithic contract, a Lock is composed at
deploy time from four cooperating modules. This separation means a single audited factory can
produce many different locking behaviours simply by swapping the implementation used for each
module.

Key capabilities:

- **NFT-backed positions** — each beneficiary's allocation is minted as an ERC-721 token. Positions
  can be transferred (if the policy allows), split among new owners, and queried individually.
- **Pluggable unlock schedules** — linear, interval, date-based, equal, and event-driven vesting.
- **Beneficiary management** — beneficiaries can be added or removed before the first release
  (subject to per-lock policy flags), with tokens automatically returned or distributed on removal.
- **Position splitting** — an owner can split an NFT into several new NFTs, respecting the
  still-locked proportion.
- **Upgradeable by design** — every module is deployed behind a UUPS proxy and upgrades require both
  governance and user authorization.
- **Flexible deploy-fee economics** — fixed fee, percentage-of-locked-tokens fee, or a combination,
  priced via Chainlink feeds, with whitelist and discount-token support.

---

## Architecture

### Core modules

A deployed Lock is an assembly of four module proxies wired together by the `LockFactory`:

| Module | Contract | Responsibility |
| --- | --- | --- |
| **Lock** | `contracts/Lock/Lock.sol` | The user-facing ERC-721 contract. Holds the locked ERC-20, mints/burns position NFTs, and orchestrates claiming, adding/removing beneficiaries, splitting, and transfers. |
| **Deposit Manager** | `contracts/DepositManager/DepositManager.sol` | Stores per-NFT bookkeeping — beneficiary, addition time, initial amount, and claimed amount. Handles deposits, removals, splits, and claim accounting. |
| **Schedule Manager** | `contracts/ScheduleManager/*.sol` | Implements the unlock curve. Given an initial amount it returns how much is currently unlocked, plus lock start/end and next-release timestamps. |
| **Split Manager** | `contracts/SplitManager/*.sol` | Tracks the locked vs. splittable proportion of each NFT and validates split operations (proportions must total 100%). |

These communicate through the interfaces in `contracts/interfaces/` (`ILock`, `IDepositManager`,
`IUnlockSchedule`, `ISplitManager`), so any conforming implementation can be substituted.

### Module variants

The factory can deploy any of the following pre-built implementations (see
`scripts/deployLockImplementaionContracts.js`):

- **Locks:** `Lock` (standard ERC-721 vesting lock), `FixedValueLock` (fixed-value positions),
  `LiquidityLock` (LP-token locking).
- **Deposit Managers:** `DepositManager`, `DepositManagerMT` (Merkle-tree based, for large
  beneficiary lists claimed via proof), `FixedValueDepositManager`.
- **Unlock Schedules:** `LinearUnlockSchedule` (continuous vesting with optional cliff),
  `IntervalUnlockSchedule` (discrete periodic releases), `EqualUnlockSchedule` (equal tranches),
  `DateUnlockSchedule` (calendar-date releases), `EventUnlockSchedule` (released by an external
  trigger; Chainlink Keeper / `KeeperCompatibleInterface` compatible).
- **Split Managers:** `SplitManager`, `SplitManagerTrue`, `SplitManagerFalse` (policies that permit
  or forbid splitting).

`contracts/UpkeepConsumer.sol` integrates with Chainlink Automation for event-driven schedules, and
`contracts/DeployFee.sol` provides the shared fee logic consumed by the factory.

### Lifecycle of a lock

1. **Deploy implementations once.** `deployLockImplementaionContracts.js` deploys (and verifies) a
   single copy of every module implementation. These act as logic templates.
2. **Deploy a Lock via the factory.** A caller invokes `LockFactory.deployLock(...)`, choosing which
   implementations to use and passing ABI-encoded init data for each module. The factory:
   - Charges the deploy fee (unless the token/caller is whitelisted).
   - Deploys an `ERC1967Proxy` for the Lock and for each module.
   - Pulls the ERC-20 to be locked from the caller and initializes the Lock.
   - Grants admin/upgrade roles to the caller and renounces its own.
3. **Beneficiaries claim.** As the schedule unlocks tokens, beneficiaries call `claimUnlocked` on
   the Lock to withdraw their currently-vested amount. Merkle-based managers require a proof
   (`claimNFT`) to mint the position first.
4. **Manage positions.** Subject to per-lock flags, the beneficiary manager can add/remove
   beneficiaries before the first release, and owners can split or transfer NFTs.

### Upgradeability & access control

All modules inherit `BaseGovernanceWithUserUpgradable` and use the **UUPS** proxy pattern
(`@openzeppelin/contracts-upgradeable`). Upgrades require authorization from **both** governance and
the user, providing a check against unilateral upgrades. Role-based access control
(`AccessControlEnumerable`) gates factory administration (`FACTORY_MANAGER`), whitelisting
(`WHITE_LIST`), and per-module roles such as `BENEFICIARY_MANAGER_ROLE` and `DEPOSIT_MANAGER_ROLE`.

### Deploy fees

`DeployFee` supports three payment options — **fixed**, **percentage of locked tokens**, and
**combined** — configured by the factory manager. Fees can be paid in any registered payment token,
with amounts derived from **Chainlink price feeds** (e.g. ETH/USD, BNB/USD). Discount tokens and an
address/token whitelist allow fee reductions or full waivers.

---

## Tech Stack

- **Solidity** `0.8.17` (optimizer enabled, 200 runs)
- **Hardhat** development environment (`@nomicfoundation/hardhat-toolbox`)
- **OpenZeppelin** Contracts & Contracts-Upgradeable (v4) + Hardhat Upgrades plugin (UUPS)
- **Chainlink** contracts (price feeds & automation/keepers)
- **Uniswap** v2-core / v3-periphery (liquidity locking)
- Testing: **Mocha + Chai** (`hardhat-chai-matchers`), `solidity-coverage`,
  `hardhat-gas-reporter`, `hardhat-contract-sizer`, `merkletreejs` / `keccak256`

---

## Repository Layout

```
.
├── contracts/
│   ├── LockFactory.sol            # Entry point: deploys & wires Lock instances
│   ├── DeployFee.sol              # Shared deploy-fee logic (fixed/percentage/combined)
│   ├── UpkeepConsumer.sol         # Chainlink Automation integration
│   ├── Lock/                      # Lock, FixedValueLock, LiquidityLock
│   ├── DepositManager/            # DepositManager, DepositManagerMT, FixedValueDepositManager
│   ├── ScheduleManager/           # Linear, Interval, Equal, Date, Event unlock schedules
│   ├── SplitManager/              # SplitManager (+ True/False policies)
│   ├── interfaces/                # ILock, IDepositManager, IUnlockSchedule, ISplitManager, ...
│   ├── common/                    # BaseGovernance(WithUser)Upgradable base contracts
│   ├── access/ & security/        # Rewritten AccessControl / Pausable helpers
│   └── test/                      # Mock tokens & contracts used in tests
├── scripts/
│   ├── deployLockImplementaionContracts.js   # Deploy + verify all implementations
│   ├── 1_initial_deploy.js                   # Example end-to-end proxy deployment
│   ├── deployToken.js                        # Deploy a test ERC-20
│   ├── verifyContracts.js / verifyLockProxy.js
├── test/V1/                       # Unit tests + 24 end-to-end scenario suites (TS-001…TS-024)
├── web/                           # Standalone LockFactory web UI + ABIs
├── hardhat.config.js              # Networks, compiler, etherscan, gas reporter
├── deployed_instances.json        # Last-deployed implementation addresses
├── .env.default                   # Template environment file
└── package.json
```

---

## Prerequisites

- **Node.js 16** (matches the CI configuration in `.github/workflows/smartcontract-tests.yml`)
- **Yarn** (a `yarn.lock` is committed; npm also works via the `package-lock.json`)
- An **Alchemy** (or equivalent RPC) API key — required for the default Hardhat network, which
  **forks Polygon mainnet** for tests
- For deployment/verification: a wallet mnemonic and the relevant block-explorer API keys

---

## Getting Started

```bash
# 1. Clone
git clone <repository-url>
cd lokr

# 2. Install dependencies
yarn install        # or: npm install

# 3. Create your environment file
cp .env.default .env
# then edit .env (see Configuration below)

# 4. Compile
yarn compile

# 5. Run the test suite
yarn test
```

> **Note:** the default Hardhat network forks Polygon mainnet, so `ALCHEMY_KEY` must be set in your
> `.env` for tests to run.

---

## Configuration

Copy `.env.default` to `.env` and fill in the values you need:

| Variable | Purpose |
| --- | --- |
| `MNEMONIC` | Deployer wallet mnemonic (used by all live networks) |
| `ALCHEMY_KEY` | RPC key for Polygon mainnet (also used by the forked Hardhat network) |
| `ALCHEMY_KEY_GOERLI` / `ALCHEMY_KEY_POLYGONMUMBAI` | RPC keys for the respective testnets |
| `ETHERSCAN_API_KEY` / `BSCSCAN_API_KEY` / `POLYGONSCAN_API_KEY` | Contract verification |
| `COINMARKETCAP_API_KEY` | Pricing for the gas reporter |
| `REPORT_GAS` | Set to `true` to enable gas reporting during tests |

All values are loaded via `dotenv` in `hardhat.config.js`. **Never commit your `.env`** — it is
already in `.gitignore`.

---

## Building & Testing

Common scripts (defined in `package.json`):

```bash
yarn compile               # Compile contracts (alias: yarn build)
yarn clean                 # Clear Hardhat cache & artifacts
yarn test                  # Run the full test suite
yarn check-contract-size   # Report contract bytecode sizes (strict mode)
```

Targeted test runs:

```bash
yarn test-lock        # Lock tests
yarn test-dm          # DepositManager tests
yarn test-sm          # SplitManager tests
yarn test-interval    # Interval unlock schedule tests
yarn test-linear      # Linear unlock schedule tests
```

Run a single file or scenario directly:

```bash
npx hardhat test test/V1/TestScenarios/TS-001.test.js
```

Additional tooling available via Hardhat: `npx hardhat coverage` (solidity-coverage) and
`REPORT_GAS=true yarn test` for gas reporting.

> **CI:** every push runs the full test suite and a contract-size check on Node 16
> (`.github/workflows/smartcontract-tests.yml`).

---

## Deployment

**1 — Deploy all module implementations** (then they can be reused by the factory):

```bash
yarn deploy-impl:goerli     # Ethereum Goerli testnet
yarn deploy-impl:bsctest    # BSC testnet
yarn deploy-impl:mumbai     # Polygon Mumbai testnet
```

This deploys every contract in the implementation list, waits for confirmations, attempts
verification on the block explorer, and writes the resulting addresses to `deployed_instances.json`.

**2 — Deploy individual proxies / an end-to-end example:**

```bash
npx hardhat run scripts/1_initial_deploy.js --network <network>
npx hardhat run scripts/deployToken.js --network <network>      # deploy a test ERC-20
```

**3 — Verify contracts** (if not done automatically):

```bash
npx hardhat run scripts/verifyContracts.js --network <network>
npx hardhat run scripts/verifyLockProxy.js --network <network>
```

A reference web front end for interacting with a deployed factory lives in `web/`
(`web/LockFactory.html` + ABIs under `web/abi/`).

---

## Supported Networks

Configured in `hardhat.config.js`:

| Network | Key |
| --- | --- |
| Hardhat (forks Polygon mainnet) | `hardhat` (default) |
| Localhost | `localhost` |
| Ethereum mainnet | `eth_mainnet` |
| Ethereum Goerli | `goerli` |
| BNB Smart Chain mainnet | `binance_mainnet` |
| BSC testnet | `bscTestnet` |
| Polygon mainnet | `polygon` |
| Polygon Mumbai | `polygonMumbai` |

---

## Security Notes

- These contracts are **upgradeable** (UUPS). Upgrade authority is split between governance and the
  user, but upgradeable systems carry inherent trust assumptions — review the roles granted in
  `LockFactory.manageRoles` before relying on a deployment.
- Tokens with **transfer fees / rebasing** are explicitly rejected during locking (the contracts
  require the received balance to equal the requested amount).
- Always run an independent audit before mainnet use. Secrets (mnemonics, API keys) must never be
  committed; use the `.env` file, which is git-ignored.

---

## License

Distributed under the **Business Source License 1.1 (BUSL-1.1)**. See the SPDX headers in each
contract source file for details.
