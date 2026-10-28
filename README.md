# GateFlow

**Employee Attendance & Visitor Management on the Stellar Blockchain**

GateFlow is a workforce attendance and visitor access platform that combines a conventional, privacy-respecting application stack with **tamper-evident, publicly verifiable audit trails** anchored on the [Stellar](https://stellar.org) network using [Soroban](https://soroban.stellar.org) smart contracts.

> **Design principle:** personal data stays off-chain; only cryptographic proofs go on-chain.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Why Stellar?](#2-why-stellar)
3. [Key Features](#3-key-features)
4. [Architecture](#4-architecture)
5. [Privacy and Data Protection Model](#5-privacy-and-data-protection-model)
6. [Core Workflows](#6-core-workflows)
7. [Smart Contract Design](#7-smart-contract-design)
8. [Tech Stack](#8-tech-stack)
9. [Repository Structure](#9-repository-structure)
10. [Getting Started](#10-getting-started)
11. [Configuration](#11-configuration)
12. [Database Schema](#12-database-schema)
13. [API Reference](#13-api-reference)
14. [Presence Verification and Anti-Fraud](#14-presence-verification-and-anti-fraud)
15. [Identity, Wallets and Fees](#15-identity-wallets-and-fees)
16. [Testing](#16-testing)
17. [Deployment](#17-deployment)
18. [Security](#18-security)
19. [Monitoring and Operations](#19-monitoring-and-operations)
20. [Roadmap](#20-roadmap)
21. [Contributing](#21-contributing)
22. [FAQ](#22-faq)
23. [License](#23-license)

---

## 1. Overview

Organizations need two things from their gates and front desks: **trustworthy attendance records** and **controlled visitor access**. Traditional systems store everything in a single database that administrators can quietly edit, and that auditors, clients or regulators have to take on trust.

GateFlow keeps the day-to-day experience simple (scan a QR code, tap a badge, receive a visitor pass) while adding a verifiable layer underneath:

- **Employees** check in and out via mobile app, QR, NFC or kiosk.
- **Visitors** are pre-registered by a host and receive a signed QR pass.
- **Security guards** scan passes at the gate and see instantly whether they are valid.
- **HR and admins** manage sites, schedules, reports and corrections.
- **Auditors and third parties** can independently verify that a record existed at a point in time and has not been altered, without ever seeing personal data.

### Who is it for?

- Companies with multiple sites, contractors or outsourced staff
- Estates, campuses, factories, hospitals and co-working spaces
- Organizations subject to audits, labour-compliance checks or client SLAs
- SaaS operators who want to offer customers verifiable records without asking them to trust the vendor

---

## 2. Why Stellar?

| Requirement | How Stellar helps |
|---|---|
| Low, predictable cost | Transaction fees are a tiny fraction of a cent, which makes anchoring hourly or daily practical |
| Fast finality | Ledgers close in roughly 5 seconds, so verification is near real time |
| Programmability | Soroban smart contracts (Rust compiled to WebAssembly) handle roles, passes and anchors |
| Sponsored fees | Fee-bump transactions let the company pay all fees, so users never touch crypto |
| Passkey wallets | Smart wallets secured by device biometrics remove key-management burden |
| Public verifiability | Anyone can inspect anchors via an explorer such as Stellar Expert |

### When blockchain is (and isn't) worth it

Blockchain adds real value when you need **tamper-proof audit trails**, **multi-party trust** (contractors, clients, regulators) or a **multi-tenant product** where customers should not have to trust the operator. For a single company with none of those needs, a normal database is simpler. GateFlow keeps the on-chain footprint deliberately small so it earns its place.

---

## 3. Key Features

### Attendance
- Employee check-in and check-out (QR, NFC, BLE/geofence, kiosk)
- Shift schedules, grace periods, late and early-leave rules
- Overtime and break tracking
- Leave and holiday calendars
- Manual corrections with a mandatory reason and approval workflow, recorded on-chain
- Periodic Merkle-root anchoring with per-record proof generation
- Exports: CSV, PDF, payroll-ready reports

### Visitor Management
- Host pre-registration with encrypted visitor details
- Signed, time-bound QR passes sent by email, SMS or WhatsApp
- Gate verification (valid, expired, revoked, wrong site)
- Entry and exit logging with host notifications
- Instant revocation and automatic expiry
- Walk-in registration at the kiosk with host approval
- Blacklist and watch-list support
- Visitor badge printing (optional)

### Administration and Compliance
- Role-based access control (admin, HR, security, host, auditor)
- Multi-site and (optionally) multi-tenant support
- Immutable audit log of all privileged actions
- Public proof-verification page for auditors
- Data-retention policies and subject-access/erasure tooling
- Webhooks and REST API for HRIS, payroll and access-control integrations

---

## 4. Architecture

### High-level diagram

```
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│ Employee App │  │  Gate/Kiosk  │  │  Admin Dashboard │
│ (React Native)│ │     App      │  │    (Next.js)     │
└──────┬───────┘  └──────┬───────┘  └────────┬─────────┘
       │                 │                   │
       └─────────────────┼───────────────────┘
                         ▼
              ┌─────────────────────┐
              │    Backend API      │  NestJS · REST · WebSockets
              │ Auth · RBAC · Logic │
              └───┬────────┬────────┘
                  │        │
        ┌─────────▼──┐  ┌──▼───────────┐   ┌──────────────┐
        │ PostgreSQL │  │ Redis/BullMQ │   │ KMS / Vault  │
        │ (PII, logs)│  │ (queues)     │   │ (keys)       │
        └────────────┘  └──┬───────────┘   └──────────────┘
                           │
                  ┌────────▼─────────┐
                  │ Anchoring Worker │  batches · Merkle trees · fee bumps
                  └────────┬─────────┘
                           ▼
                  ┌──────────────────┐
                  │  Soroban RPC     │
                  └────────┬─────────┘
                           ▼
                  ┌──────────────────┐
                  │ Stellar Network  │  GateFlow smart contracts
                  └──────────────────┘
```

### Layer responsibilities

| Layer | Responsibility |
|---|---|
| **Client apps** | UI, QR/NFC/BLE capture, device biometrics, offline queueing |
| **Backend API** | Authentication, authorization, business rules, encrypted PII handling, reporting, webhooks |
| **PostgreSQL** | Source of truth for personal data, schedules, raw attendance events, passes |
| **Redis + BullMQ** | Job queues, rate limiting, short-lived token cache |
| **Anchoring worker** | Builds Merkle trees, submits roots on-chain, stores proofs and transaction hashes |
| **Soroban contracts** | Roles, site registry, anchors, pass lifecycle, audit events |
| **Stellar network** | Consensus, timestamps, immutable history |

### Attendance anchoring strategy

| Approach | Description | Trade-off |
|---|---|---|
| **Per-event transactions** | Every check-in or out is a contract call | Simple and transparent, but high volume and cost |
| **Merkle anchoring (default)** | Events are batched; only the root hash is written hourly or daily | Cheap and private; individual records proven via Merkle proof |
| **Hybrid (recommended)** | Merkle anchoring for routine events, direct on-chain calls for overrides, corrections and approvals | Best balance of cost and accountability |

---

## 5. Privacy and Data Protection Model

Blockchain data is permanent and public. **Nothing that identifies a person is ever written to the ledger.**

### What goes on-chain

- Merkle roots (32-byte hashes)
- Pass hashes (salted, non-reversible)
- Pass lifecycle events (issued, used, revoked) referencing hashes only
- Role assignments (organizational wallet addresses, not personal identities)
- Site identifiers (opaque IDs)
- Correction and override records (reason hash, approver address)

### What stays off-chain

- Names, photos, phone numbers, emails, national IDs
- Raw attendance timestamps tied to a person
- Visitor company, purpose of visit and vehicle details
- Biometric templates (never stored by GateFlow; handled by the device)

### Salted leaf hashing

Each Merkle leaf is computed as:

```
leaf = SHA-256( canonical_json({ employee_ref, site_id, type, timestamp, nonce }) || salt )
```

The per-record random `salt` prevents anyone from guessing employee IDs or timestamps by brute-forcing hashes. Salts are stored encrypted in the database and revealed only when a proof is shared deliberately.

### Erasure and retention

Because personal data lives off-chain, a deletion request is honoured by deleting the database record and its salt. The remaining on-chain hash becomes unlinkable noise, which is the accepted approach for reconciling immutable ledgers with GDPR, NDPR and similar laws.

> **Disclaimer:** This section describes a technical design, not legal advice. Consult counsel for your jurisdiction (GDPR, NDPR, POPIA, CCPA, etc.).

---

## 6. Core Workflows

### 6.1 Employee check-in

1. Employee opens the app (or taps an NFC badge) at the gate.
2. The app presents a **rotating QR** or reads the gate's rotating QR (see [Section 14](#14-presence-verification-and-anti-fraud)).
3. The backend validates identity, shift, site and presence proof.
4. The event is stored in PostgreSQL with a salted leaf hash.
5. The employee receives instant confirmation.
6. At the end of the period, the anchoring worker builds the Merkle tree and submits the root on-chain.

### 6.2 Merkle anchoring

1. A scheduled job selects all unanchored events for a `(site, period)`.
2. Leaves are sorted deterministically and the tree is built.
3. The worker calls `anchor_attendance(site_id, period, merkle_root)` through a fee-bump transaction.
4. The transaction hash and each record's Merkle proof are saved.
5. The job is idempotent: retries never create duplicate anchors for the same `(site, period)`.

### 6.3 Verifying a record (auditor)

1. The auditor receives a proof bundle: `{ leaf, proof[], root, period, site_id, tx_hash }`.
2. They recompute the root from the leaf and proof.
3. They compare it with the root stored in the contract (via the public verification page or Stellar Expert).
4. A match proves the record existed at that time and has not been altered since.

### 6.4 Visitor lifecycle

```
 Pre-register ──► Issue pass ──► Deliver QR ──► Gate scan ──► Entry ──► Exit
      │               │                            │                      │
  (host, off-chain) (on-chain pass)         (verify_pass)           (record_exit)
                      │                            │
                      └────────── Revoke / Expire ─┘
```

1. **Pre-registration:** a host enters visitor details; they are encrypted and stored off-chain.
2. **Pass issuance:** the backend calls `issue_pass(host, pass_hash, valid_until, site_id)`.
3. **Delivery:** the visitor receives a signed QR code (Ed25519) by email, SMS or WhatsApp.
4. **Gate scan:** the kiosk verifies the signature locally, then confirms status on-chain or from a cached, signed status feed.
5. **Entry and exit:** logged off-chain; optionally mirrored on-chain via `record_entry` and `record_exit`.
6. **Revocation:** a host or admin can revoke at any time; passes also expire automatically.

### 6.5 Corrections and overrides

Corrections are privileged and always auditable:

1. HR submits a correction with a reason.
2. A second approver confirms (four-eyes principle).
3. The backend writes a direct on-chain record containing the correction hash, approver and timestamp.
4. The original event is never deleted; it is superseded by a linked correction record.

---

## 7. Smart Contract Design

Contracts are written in **Rust** with the **Soroban SDK**.

### 7.1 Contract modules

| Contract | Purpose |
|---|---|
| `gateflow-core` | Roles, site registry, shared types, events |
| `gateflow-attendance` | Merkle-root anchors, corrections |
| `gateflow-visitors` | Pass issuance, entry/exit, revocation, verification |

A single combined contract is fine for the MVP; splitting makes upgrades and audits easier later.

### 7.2 Roles

| Role | Capabilities |
|---|---|
| `Admin` | Register sites, assign roles, pause the contract, upgrade |
| `HR` | Submit and approve corrections, anchor attendance |
| `Security` | Record entry/exit, verify passes |
| `Host` | Issue and revoke passes for own visitors |
| `Anchorer` | Service account allowed to submit Merkle roots |

### 7.3 Public interface

| Function | Caller | Description |
|---|---|---|
| `initialize(admin)` | Deployer | One-time setup |
| `register_site(admin, site_id)` | Admin | Registers a site |
| `add_role(admin, address, role)` | Admin | Grants a role |
| `remove_role(admin, address, role)` | Admin | Revokes a role |
| `anchor_attendance(anchorer, site_id, period, merkle_root)` | Anchorer | Stores a root; rejects duplicates for the same `(site, period)` |
| `record_correction(hr, site_id, correction_hash, approver)` | HR | Logs an approved correction |
| `issue_pass(host, pass_hash, valid_until, site_id)` | Host | Creates a pass, returns `pass_id` |
| `record_entry(guard, pass_id)` | Security | Marks entry |
| `record_exit(guard, pass_id)` | Security | Marks exit |
| `revoke_pass(caller, pass_id)` | Host or Admin | Revokes a pass |
| `verify_pass(pass_id)` | Anyone (read-only) | Returns status: valid, expired, revoked, used |
| `get_anchor(site_id, period)` | Anyone (read-only) | Returns the stored root and ledger timestamp |
| `pause(admin)` / `unpause(admin)` | Admin | Emergency stop |

### 7.4 Data model (on-chain)

```rust
#[contracttype]
pub enum DataKey {
    Admin,
    Role(Address),                 // -> Role
    Site(BytesN<32>),              // -> bool (registered)
    Anchor(BytesN<32>, u64),       // (site_id, period) -> AnchorRecord
    Pass(BytesN<32>),              // pass_id -> PassRecord
    Paused,
}

#[contracttype]
pub struct AnchorRecord {
    pub merkle_root: BytesN<32>,
    pub submitted_by: Address,
    pub ledger_time: u64,
}

#[contracttype]
pub struct PassRecord {
    pub pass_hash: BytesN<32>,
    pub host: Address,
    pub site_id: BytesN<32>,
    pub valid_from: u64,
    pub valid_until: u64,
    pub status: PassStatus,        // Issued | Entered | Exited | Revoked
}
```

### 7.5 Example: anchoring function (sketch)

```rust
pub fn anchor_attendance(
    env: Env,
    anchorer: Address,
    site_id: BytesN<32>,
    period: u64,
    merkle_root: BytesN<32>,
) {
    anchorer.require_auth();
    Self::assert_not_paused(&env);
    Self::assert_role(&env, &anchorer, Role::Anchorer);
    Self::assert_site_registered(&env, &site_id);

    let key = DataKey::Anchor(site_id.clone(), period);
    if env.storage().persistent().has(&key) {
        panic_with_error!(&env, Error::AnchorAlreadyExists);
    }

    env.storage().persistent().set(&key, &AnchorRecord {
        merkle_root: merkle_root.clone(),
        submitted_by: anchorer,
        ledger_time: env.ledger().timestamp(),
    });

    env.events().publish((symbol_short!("anchor"), site_id, period), merkle_root);
}
```

### 7.6 Storage and state-archival notes

- Soroban state has **time-to-live (TTL)**; entries must be extended or they become archived. Anchors and passes should have their TTL extended on write, and a maintenance job should extend long-lived entries.
- Use `persistent` storage for anchors and passes, `instance` storage for admin and pause flags, and `temporary` storage only for disposable data.
- Keep records compact; storage costs scale with size and duration.

### 7.7 Contract security principles

- Every state-changing function calls `require_auth()` on the acting address.
- Role checks are explicit and tested for every function.
- Anchors are write-once; corrections are append-only.
- An emergency `pause` is available to the admin (ideally a multisig).
- Upgrades are restricted to the admin and should be time-locked in production.
- An **independent audit is mandatory before mainnet**.

---

## 8. Tech Stack

### Blockchain

| Component | Choice |
|---|---|
| Smart contracts | Rust + Soroban SDK |
| Tooling | Stellar CLI, `cargo test`, Soroban testutils |
| Network access | Soroban RPC (hosted provider or self-run) |
| JS integration | `@stellar/stellar-sdk` |
| Smart wallets | Stellar passkey-kit |
| Fees | Fee-bump transactions |
| Dev network | Testnet + Friendbot |
| Explorer | Stellar Expert |

### Backend

| Component | Choice |
|---|---|
| Language / framework | TypeScript + NestJS |
| Database | PostgreSQL |
| ORM | Prisma or Drizzle |
| Cache and rate limiting | Redis |
| Job queue | BullMQ |
| Merkle trees | `merkletreejs` (or custom SHA-256) |
| Auth | JWT + refresh tokens; OIDC/SSO for enterprise |
| Encryption | AES-256-GCM for PII fields; keys in a KMS |
| QR signing | Ed25519, short-lived tokens |
| Notifications | SendGrid/Resend (email), Twilio/Termii (SMS), FCM/APNs (push), WhatsApp Business API |
| API style | REST + OpenAPI; WebSockets for live gate events |

### Frontend and mobile

| App | Choice |
|---|---|
| Admin dashboard | Next.js + Tailwind CSS + shadcn/ui |
| Employee app | React Native (Expo) |
| Gate/kiosk app | React Native or PWA on a tablet |
| QR scanning | `expo-camera` / `react-native-vision-camera` |
| NFC | `react-native-nfc-manager` |
| Charts | Recharts |

### Infrastructure

- Docker containers on AWS ECS, GCP Cloud Run or Kubernetes
- GitHub Actions for CI/CD
- Cloud secret manager and KMS/HSM for signing keys
- Sentry, Prometheus and Grafana for observability
- Automated PostgreSQL backups with point-in-time recovery

---

## 9. Repository Structure

A pnpm + Turborepo monorepo keeps the contracts, API, web and mobile apps in sync.

```
gateflow/
├── apps/
│   ├── api/                  # NestJS backend
│   │   ├── src/
│   │   │   ├── auth/
│   │   │   ├── employees/
│   │   │   ├── attendance/
│   │   │   ├── visitors/
│   │   │   ├── passes/
│   │   │   ├── sites/
│   │   │   ├── anchoring/    # Merkle builder + Stellar submitter
│   │   │   ├── notifications/
│   │   │   ├── audit/
│   │   │   └── common/
│   │   ├── prisma/
│   │   └── test/
│   ├── admin/                # Next.js admin dashboard
│   ├── mobile/               # React Native employee app (Expo)
│   ├── kiosk/                # Gate/kiosk app
│   └── verifier/             # Public proof-verification page
├── contracts/                # Soroban smart contracts (Rust workspace)
│   ├── gateflow-core/
│   ├── gateflow-attendance/
│   ├── gateflow-visitors/
│   └── Cargo.toml
├── packages/
│   ├── shared-types/         # TypeScript types shared across apps
│   ├── merkle/               # Canonical leaf hashing + proof helpers
│   ├── stellar-client/       # Typed contract bindings and tx helpers
│   └── config/               # ESLint, TSConfig, Prettier presets
├── infra/
│   ├── docker/
│   ├── terraform/
│   └── k8s/
├── docs/
│   ├── architecture.md
│   ├── threat-model.md
│   ├── api.md
│   └── runbooks/
├── scripts/                  # Deploy, seed, key-generation helpers
├── .github/workflows/
├── docker-compose.yml
├── turbo.json
├── pnpm-workspace.yaml
└── README.md
```

---

## 10. Getting Started

### 10.1 Prerequisites

| Tool | Version (minimum) | Purpose |
|---|---|---|
| Node.js | 20 LTS | Backend and frontends |
| pnpm | 9+ | Package management |
| Rust | stable (with `wasm32v1-none` or `wasm32-unknown-unknown` target) | Contracts |
| Stellar CLI | latest | Build, deploy, invoke contracts |
| Docker + Docker Compose | latest | Local PostgreSQL and Redis |
| Expo CLI | latest | Mobile development |

> Check the [Stellar developer docs](https://developers.stellar.org) for the current recommended Rust target and CLI install method, as these change between releases.

### 10.2 Clone and install

```bash
git clone https://github.com/<your-org>/gateflow.git
cd gateflow
pnpm install
```

### 10.3 Start local services

```bash
docker compose up -d        # PostgreSQL + Redis
cp .env.example .env        # then edit values (see Section 11)
pnpm --filter api prisma migrate dev
pnpm --filter api prisma db seed
```

### 10.4 Build and deploy contracts to Testnet

```bash
# 1. Create and fund a deployer identity on testnet
stellar keys generate gateflow-deployer --network testnet --fund

# 2. Build contracts
cd contracts
stellar contract build

# 3. Deploy
stellar contract deploy \
  --wasm target/wasm32v1-none/release/gateflow_core.wasm \
  --source gateflow-deployer \
  --network testnet
# -> prints the contract ID; add it to .env as CORE_CONTRACT_ID

# 4. Initialize
stellar contract invoke \
  --id <CORE_CONTRACT_ID> \
  --source gateflow-deployer \
  --network testnet \
  -- initialize --admin <ADMIN_ADDRESS>
```

> The WASM output path depends on your Rust target. Adjust the path if you use `wasm32-unknown-unknown`.

### 10.5 Create the service accounts

GateFlow uses two Stellar accounts:

| Account | Role |
|---|---|
| **Fee sponsor** | Pays all transaction fees through fee-bump transactions |
| **Anchorer** | Holds the `Anchorer` role and signs `anchor_attendance` calls |

```bash
stellar keys generate gateflow-sponsor --network testnet --fund
stellar keys generate gateflow-anchorer --network testnet --fund
```

In production, these keys live in a KMS/HSM and are never written to `.env`.

### 10.6 Run the apps

```bash
pnpm dev                          # everything via Turborepo
# or individually:
pnpm --filter api dev             # http://localhost:3001
pnpm --filter admin dev           # http://localhost:3000
pnpm --filter verifier dev        # http://localhost:3002
pnpm --filter mobile start        # Expo
pnpm --filter kiosk start
```

### 10.7 First-run checklist

- [ ] Create the first admin user (`pnpm --filter api cli create-admin`)
- [ ] Register a site and note its `site_id`
- [ ] Grant on-chain roles to the anchorer and security accounts
- [ ] Enrol a test employee and perform a check-in
- [ ] Trigger a manual anchoring run (`pnpm --filter api cli anchor --site <id>`)
- [ ] Verify the anchor on Stellar Expert (testnet)

---

## 11. Configuration

Copy `.env.example` to `.env` and set the following.

### Core

| Variable | Description | Example |
|---|---|---|
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | API port | `3001` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://gateflow:gateflow@localhost:5432/gateflow` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |

### Authentication

| Variable | Description |
|---|---|
| `JWT_SECRET` | Access-token signing secret |
| `JWT_EXPIRES_IN` | Access-token lifetime (e.g. `15m`) |
| `REFRESH_TOKEN_EXPIRES_IN` | Refresh-token lifetime (e.g. `7d`) |
| `OIDC_ISSUER_URL` | Optional SSO provider |

### Stellar

| Variable | Description | Example |
|---|---|---|
| `STELLAR_NETWORK` | `testnet` or `mainnet` | `testnet` |
| `STELLAR_NETWORK_PASSPHRASE` | Network passphrase | `Test SDF Network ; September 2015` |
| `SOROBAN_RPC_URL` | Soroban RPC endpoint | `https://soroban-testnet.stellar.org` |
| `HORIZON_URL` | Horizon endpoint (if used) | `https://horizon-testnet.stellar.org` |
| `CORE_CONTRACT_ID` | Deployed core contract | `C...` |
| `ATTENDANCE_CONTRACT_ID` | Deployed attendance contract | `C...` |
| `VISITORS_CONTRACT_ID` | Deployed visitors contract | `C...` |
| `SPONSOR_SECRET` | Fee-sponsor key (**dev only**; use KMS in production) | `S...` |
| `ANCHORER_SECRET` | Anchorer key (**dev only**; use KMS in production) | `S...` |
| `KMS_KEY_ID` | KMS key reference for production signing | |

### Security and encryption

| Variable | Description |
|---|---|
| `PII_ENCRYPTION_KEY_ID` | KMS key used to wrap data-encryption keys |
| `QR_SIGNING_PRIVATE_KEY` | Ed25519 key for signing visitor passes (KMS in production) |
| `QR_TOKEN_TTL_SECONDS` | Lifetime of rotating employee QR tokens (e.g. `30`) |

### Anchoring

| Variable | Description | Default |
|---|---|---|
| `ANCHOR_CRON` | Anchoring schedule | `0 * * * *` (hourly) |
| `ANCHOR_PERIOD` | Period granularity: `hourly` or `daily` | `daily` |
| `ANCHOR_MAX_RETRIES` | Retries before alerting | `5` |

### Notifications

| Variable | Description |
|---|---|
| `EMAIL_PROVIDER` / `EMAIL_API_KEY` | SendGrid or Resend |
| `SMS_PROVIDER` / `SMS_API_KEY` | Twilio or Termii |
| `FCM_SERVER_KEY` | Push notifications (Android) |
| `APNS_KEY_ID` / `APNS_TEAM_ID` | Push notifications (iOS) |

> **Never commit `.env` files or secret keys.** `.gitignore` already excludes them; keep it that way.

---

## 12. Database Schema

Core tables (simplified). Personally identifying columns are encrypted at the application layer.

| Table | Key columns | Notes |
|---|---|---|
| `tenants` | `id`, `name`, `plan` | Only used in multi-tenant mode |
| `sites` | `id`, `tenant_id`, `name`, `site_id_hash`, `timezone`, `geofence` | `site_id_hash` is the on-chain identifier |
| `users` | `id`, `tenant_id`, `email_enc`, `role`, `password_hash`, `status` | Admin, HR, security, host |
| `employees` | `id`, `tenant_id`, `employee_no`, `name_enc`, `phone_enc`, `department`, `shift_id` | PII encrypted |
| `devices` | `id`, `employee_id`, `public_key`, `platform`, `bound_at` | Device binding for anti-fraud |
| `shifts` | `id`, `name`, `start`, `end`, `grace_minutes` | |
| `attendance_events` | `id`, `employee_id`, `site_id`, `type`, `occurred_at`, `method`, `leaf_hash`, `salt_enc`, `anchor_id` | `type`: `IN` / `OUT` |
| `anchors` | `id`, `site_id`, `period`, `merkle_root`, `tx_hash`, `ledger`, `status`, `created_at` | |
| `merkle_proofs` | `event_id`, `proof_json` | Stored for fast retrieval |
| `corrections` | `id`, `event_id`, `reason`, `requested_by`, `approved_by`, `onchain_tx_hash` | Append-only |
| `visitors` | `id`, `name_enc`, `phone_enc`, `email_enc`, `company_enc`, `purpose_enc` | PII encrypted |
| `passes` | `id`, `visitor_id`, `host_id`, `site_id`, `pass_hash`, `valid_from`, `valid_until`, `status`, `onchain_tx_hash` | |
| `visits` | `id`, `pass_id`, `entered_at`, `exited_at`, `guard_id` | |
| `audit_logs` | `id`, `actor_id`, `action`, `entity`, `payload`, `created_at` | Append-only; hash-chained |
| `webhooks` | `id`, `tenant_id`, `url`, `secret`, `events` | |

---

## 13. API Reference

Base URL: `/api/v1`. Full OpenAPI documentation is served at `/api/docs` when the API is running.

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/login` | Email/password login |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Invalidate refresh token |
| GET | `/auth/me` | Current user |

### Employees and sites

| Method | Endpoint | Description | Roles |
|---|---|---|---|
| GET/POST | `/employees` | List / create employees | Admin, HR |
| GET/PATCH/DELETE | `/employees/:id` | Manage an employee | Admin, HR |
| POST | `/employees/:id/devices` | Bind a device | Admin, HR |
| GET/POST | `/sites` | List / register sites (also registers on-chain) | Admin |
| GET/POST | `/shifts` | Manage shifts | Admin, HR |

### Attendance

| Method | Endpoint | Description | Roles |
|---|---|---|---|
| POST | `/attendance/qr-token` | Get a short-lived rotating QR token | Employee |
| POST | `/attendance/check-in` | Check in | Employee, Kiosk |
| POST | `/attendance/check-out` | Check out | Employee, Kiosk |
| GET | `/attendance` | Query events with filters | Admin, HR |
| POST | `/attendance/corrections` | Request a correction | HR |
| POST | `/attendance/corrections/:id/approve` | Approve (second approver) | Admin, HR |
| GET | `/attendance/reports` | Daily/weekly/monthly reports | Admin, HR |
| GET | `/attendance/events/:id/proof` | Merkle proof bundle for an event | Admin, HR, Auditor |

### Anchoring

| Method | Endpoint | Description |
|---|---|---|
| GET | `/anchors` | List anchors and statuses |
| POST | `/anchors/run` | Trigger an anchoring run manually |
| GET | `/anchors/:id` | Anchor details with tx hash and explorer link |
| POST | `/verify/proof` | Public: verify a proof bundle against the chain |

### Visitors and passes

| Method | Endpoint | Description | Roles |
|---|---|---|---|
| POST | `/visitors` | Pre-register a visitor | Host |
| POST | `/passes` | Issue a pass (on-chain) | Host |
| GET | `/passes/:id` | Pass details | Host, Security |
| POST | `/passes/:id/revoke` | Revoke a pass | Host, Admin |
| POST | `/gate/verify` | Verify a scanned QR | Security, Kiosk |
| POST | `/gate/entry` | Record entry | Security |
| POST | `/gate/exit` | Record exit | Security |
| POST | `/gate/walk-in` | Register a walk-in, request host approval | Kiosk |

### Real-time events (WebSocket)

Namespace `/ws`:

| Event | Payload |
|---|---|
| `gate.entry` | `{ passId, siteId, time }` |
| `gate.exit` | `{ passId, siteId, time }` |
| `pass.revoked` | `{ passId }` |
| `anchor.confirmed` | `{ siteId, period, txHash }` |

### Webhooks

Outbound webhooks are signed with HMAC-SHA256 (`X-GateFlow-Signature`). Supported events include `attendance.checked_in`, `attendance.checked_out`, `visitor.arrived`, `visitor.departed`, `pass.issued`, `pass.revoked` and `anchor.confirmed`.

### Error format

```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Pass has been revoked",
  "code": "PASS_REVOKED"
}
```

---

## 14. Presence Verification and Anti-Fraud

Preventing "buddy punching" is as important as recording attendance. GateFlow supports layered checks that can be combined per site.

| Method | How it works | Strength |
|---|---|---|
| **Rotating QR** | Gate screen or the employee app shows a QR that changes every ~30 seconds; tokens are single-use and server-validated | Medium |
| **NFC badge** | Employee taps a badge or phone on a gate reader | Medium |
| **BLE beacon** | App detects a site beacon within range | Medium |
| **Geofence** | GPS check against the site boundary | Low to medium (spoofable) |
| **Device binding** | Each employee is bound to a registered device (public key) | Medium |
| **Biometric unlock** | Device Face ID/fingerprint gates the app action via passkeys | High |
| **Kiosk with camera** | Optional photo capture, stored encrypted and subject to retention limits | High |

Additional safeguards:

- Replay protection through single-use tokens and nonces
- Rate limiting and anomaly detection (impossible travel, duplicate check-ins)
- Offline mode on kiosks: signed events are queued locally and synced once connectivity returns, preserving original timestamps with a server-side sanity window
- Clear audit entries for every rejected attempt

---

## 15. Identity, Wallets and Fees

### Users never handle crypto

Employees and visitors interact with a normal app. The blockchain is invisible to them.

| Option | Description | When to use |
|---|---|---|
| **Backend-managed keys** | The backend signs on behalf of organizational roles (anchorer, host service accounts) | MVP and most deployments |
| **Passkey smart wallets** | Individuals hold passkey-secured smart wallets (via passkey-kit) and approve actions with biometrics | When individual non-repudiation matters |

### Fee sponsorship

All fees are paid by the company's **sponsor account** using fee-bump transactions:

1. The inner transaction is built and signed by the acting account (anchorer, host, etc.).
2. The sponsor wraps it in a fee-bump transaction and signs.
3. The wrapped transaction is submitted through Soroban RPC.

Monitor the sponsor account's XLM balance and alert when it falls below a configurable threshold.

### Key management (production)

- Signing keys in a KMS or HSM; the application requests signatures and never sees raw keys
- Separate keys per environment and per role
- Admin role held by a multisig account
- Documented key-rotation and recovery procedures

---

## 16. Testing

| Level | Tooling | What it covers |
|---|---|---|
| Contract unit tests | `cargo test` + Soroban testutils | Every function, every role, every failure path |
| Contract property tests | `proptest` (Rust) | Invariants such as write-once anchors, no pass reuse after revoke |
| Backend unit tests | Jest or Vitest | Services, Merkle logic, encryption helpers |
| Backend API tests | Supertest | Endpoints, RBAC, validation |
| Integration tests | Testcontainers + Stellar testnet/local network | Full anchoring and pass flows |
| Web E2E | Playwright | Admin dashboard and verifier page |
| Mobile E2E | Detox or Maestro | Check-in and kiosk flows |
| Load tests | k6 | Peak shift-change traffic at the gate |

### Commands

```bash
# Contracts
cd contracts && cargo test

# Backend
pnpm --filter api test
pnpm --filter api test:e2e

# Everything
pnpm test
pnpm lint
pnpm typecheck
```

### Testing the Merkle logic

The `packages/merkle` package is shared by the backend and the verifier page, so a single test suite guarantees that canonical hashing, ordering and proof verification behave identically everywhere. Include fixtures with known roots, odd leaf counts, single-leaf trees and tampered-proof cases.

---

## 17. Deployment

### Environments

| Environment | Network | Purpose |
|---|---|---|
| `local` | Testnet or local Stellar quickstart | Development |
| `staging` | Testnet | Integration, UAT, demos |
| `production` | Mainnet | Live use |

### Container deployment

```bash
docker build -t gateflow-api ./apps/api
docker build -t gateflow-admin ./apps/admin
```

Deploy to ECS, Cloud Run or Kubernetes. Run the **anchoring worker** as a separate process from the API so that it can scale and restart independently, and ensure only one worker holds the anchoring lock per site at a time.

### Mainnet release checklist

- [ ] Independent smart-contract security audit completed and findings resolved
- [ ] Admin role assigned to a multisig account
- [ ] All signing keys moved to KMS/HSM
- [ ] Sponsor account funded with low-balance alerts enabled
- [ ] Contract TTL-extension job deployed and monitored
- [ ] Database backups and point-in-time recovery tested with a restore drill
- [ ] Rate limits, WAF and TLS configured
- [ ] Penetration test completed
- [ ] Data-protection impact assessment and privacy notice published
- [ ] Runbooks written for key compromise, contract pause and RPC outage
- [ ] Rollback plan for backend and (where possible) contract upgrades

---

## 18. Security

### Threat model summary

| Threat | Mitigation |
|---|---|
| Buddy punching / spoofed check-ins | Rotating tokens, device binding, biometrics, geofence/BLE |
| Forged or shared visitor QR codes | Ed25519 signatures, short validity, single-use entry, on-chain status check |
| Insider editing of attendance records | Merkle anchoring, append-only corrections, four-eyes approval |
| PII leakage | App-layer AES-256-GCM, KMS-wrapped keys, least-privilege access, no PII on-chain |
| Stolen signing keys | KMS/HSM, role separation, key rotation, multisig admin, pause switch |
| Contract bugs | Audit, tests, formal invariants, pause and time-locked upgrades |
| RPC provider outage | Multiple RPC endpoints, retry with backoff, anchoring queue with alerts |
| Replay attacks | Nonces, short TTLs, server-side token consumption |
| Denial of service | Rate limiting, WAF, queue back-pressure, offline kiosk mode |
| Sponsor account drain | Spending limits, allow-listed contracts and operations, balance alerts |

### Application security practices

- Input validation on every endpoint; parameterized queries only
- Strict CORS, security headers and CSRF protection where applicable
- Password hashing with Argon2id; optional MFA for admin and HR roles
- Dependency scanning (Dependabot, `cargo audit`, `pnpm audit`) in CI
- Secrets scanning in CI to block committed keys
- Principle of least privilege for database roles and cloud IAM

### Reporting vulnerabilities

Please **do not** open public issues for security problems. Email `security@your-domain.example` with details and reproduction steps. We aim to acknowledge reports within 72 hours.

---

## 19. Monitoring and Operations

| Concern | Tooling | Alert examples |
|---|---|---|
| Errors and traces | Sentry, OpenTelemetry | Spike in 5xx responses |
| Metrics | Prometheus + Grafana | Gate verification latency, check-in rate |
| Logs | Loki or CloudWatch (structured JSON) | Repeated failed token validations |
| Anchoring health | Custom metric + alert | No successful anchor within 2× the schedule |
| Sponsor balance | Scheduled check | XLM balance below threshold |
| Contract TTL | Scheduled job | Entries nearing archival |
| Database | Cloud monitoring | Replication lag, storage, slow queries |

### Operational runbooks (in `docs/runbooks/`)

- Failed or stuck anchoring job
- Soroban RPC outage or degraded provider
- Sponsor account low on funds
- Key compromise and rotation
- Emergency contract pause and unpause
- Restoring PostgreSQL from backup
- Handling a data-subject deletion request

---

## 20. Roadmap

### Phase 1: MVP (testnet)
- [x] Monorepo, CI and local dev environment
- [x] Employee enrolment and QR check-in/out
- [x] Daily Merkle anchoring to Soroban testnet
- [x] Admin dashboard (employees, sites, attendance, reports)
- [x] Proof generation and verification

### Phase 2: Visitor management
- [x] Soroban smart contract for visitor pass management (`gateflow-visitors`)
- [x] Visitor pre-registration with AES-256 encrypted PII
- [x] Time-bound pass issuance anchored on Stellar
- [x] Security Guard Gate Terminal scanner UI (`apps/admin/src/app/gate`)
- [x] Instant on-chain pass revocation and automatic expiry checks
- [x] Kiosk walk-in visitor registration workflow
- [x] Dual public proof & visitor pass verifier application (`apps/verifier`)

### Phase 3: Hardening
- [ ] Fee sponsorship with spending guards
- [x] Full RBAC, cryptographic audit log chain verification, and compliance export (JSON/CSV)
- [x] Public auditor verification page (Merkle proofs + Soroban passes)
- [x] Geofencing anti-fraud validation and device-binding presence checks
- [x] Four-eyes attendance corrections workflow with on-chain Soroban hash anchoring
- [x] Payroll reporting engine with CSV export and outbound HMAC-SHA256 webhooks

### Phase 4: Production
- [ ] External contract audit and penetration test
- [ ] Mainnet deployment with multisig admin
- [ ] Multi-site and multi-tenant support
- [ ] SSO (OIDC/SAML) and SCIM provisioning

### Future ideas
- Passkey smart wallets for individual non-repudiation
- Zero-knowledge proofs for attendance claims (for example, "attended at least 20 days") without revealing dates
- Contractor and client portals with scoped proof access
- Tokenized or verifiable credentials for site inductions and safety training
- Integration with turnstiles, boom barriers and door controllers
- Analytics: occupancy, peak times, visitor flow

---

## 21. Contributing

Contributions are welcome.

1. Fork the repository and create a branch: `git checkout -b feat/short-description`
2. Follow the code style (ESLint, Prettier, `cargo fmt`, `cargo clippy`)
3. Add or update tests for every change
4. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:` …)
5. Run `pnpm lint && pnpm test` and `cargo test` before pushing
6. Open a pull request describing the change, motivation and testing performed

### Contract change policy

Changes to `contracts/` require at least two reviewers, updated tests including failure paths, and a note on any storage-layout or upgrade implications.

### Code of conduct

Participation is governed by the [Contributor Covenant](https://www.contributor-covenant.org/). Be respectful and constructive.

---

## 22. FAQ

**Do employees need a crypto wallet or XLM?**
No. The company pays all fees via fee-bump transactions, and users interact with a normal app.

**Is personal data stored on the blockchain?**
No. Only hashes and opaque identifiers are stored. Personal data stays in the encrypted off-chain database.

**How does this comply with the right to erasure?**
Deleting the off-chain record and its salt makes the on-chain hash unlinkable to any person. Confirm the approach with your legal counsel.

**What happens if the blockchain or RPC is unavailable?**
Check-ins and gate scans continue to work because they rely on the off-chain system. Anchoring jobs queue and retry, and alerts fire if anchoring falls behind.

**Can records be edited?**
Raw events are never deleted. Corrections are appended, require approval, and are recorded on-chain, so the full history remains visible.

**How much does it cost to run on-chain?**
With Merkle anchoring, one small transaction per site per period (for example, daily), plus pass-related calls. Costs are minimal, but you must also budget for contract storage TTL extensions.

**Can I use it without blockchain?**
The anchoring and pass-status modules are pluggable. You can run GateFlow in "database-only" mode, though you lose independent verifiability.

**Single company or SaaS?**
Both are supported by design. Single-organization deployments use one tenant; SaaS deployments add the `tenants` layer and per-tenant contract roles or per-tenant contract instances.

---

## 23. License

Released under the [MIT License](./LICENSE)

---

### Acknowledgements

- [Stellar Development Foundation](https://stellar.org) and the Soroban community
- [Stellar Developer Docs](https://developers.stellar.org)
- Open-source libraries used throughout the stack

---

<p align="center"><strong>GateFlow</strong>: verifiable attendance and access, without exposing personal data.</p>
