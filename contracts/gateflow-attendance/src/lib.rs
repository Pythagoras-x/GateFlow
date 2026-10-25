#![no_std]
use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, symbol_short, Address,
    BytesN, Env,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum AttendanceError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    ContractPaused = 4,
    AnchorAlreadyExists = 5,
    AnchorNotFound = 6,
    SiteNotRegistered = 7,
    InvalidCorrection = 8,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Role {
    Admin = 1,
    HR = 2,
    Security = 3,
    Host = 4,
    Anchorer = 5,
}

#[contractclient(name = "CoreClient")]
pub trait CoreContractInterface {
    fn has_role(env: &Env, target: Address, role: Role) -> bool;
    fn is_site_registered(env: &Env, site_id: BytesN<32>) -> bool;
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AnchorRecord {
    pub merkle_root: BytesN<32>,
    pub submitted_by: Address,
    pub ledger_time: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CorrectionRecord {
    pub site_id: BytesN<32>,
    pub correction_hash: BytesN<32>,
    pub requested_by: Address,
    pub approved_by: Address,
    pub ledger_time: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    CoreContract,
    Anchor(BytesN<32>, u64),
    Correction(BytesN<32>),
    Paused,
}

#[contract]
pub struct GateFlowAttendanceContract;

#[contractimpl]
impl GateFlowAttendanceContract {
    /// Initialize the attendance anchoring contract.
    pub fn initialize(
        env: Env,
        admin: Address,
        core_contract: Address,
    ) -> Result<(), AttendanceError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(AttendanceError::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::CoreContract, &core_contract);
        env.storage().instance().set(&DataKey::Paused, &false);

        env.events().publish((symbol_short!("init"),), admin);
        Ok(())
    }

    /// Retrieve the admin address.
    pub fn get_admin(env: Env) -> Result<Address, AttendanceError> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(AttendanceError::NotInitialized)
    }

    /// Retrieve the core contract address.
    pub fn get_core_contract(env: Env) -> Result<Address, AttendanceError> {
        env.storage()
            .instance()
            .get(&DataKey::CoreContract)
            .ok_or(AttendanceError::NotInitialized)
    }

    /// Submit a Merkle root for a given site and time period (e.g. daily/hourly timestamp).
    /// Write-once: duplicate anchors for (site, period) are strictly rejected.
    pub fn anchor_attendance(
        env: Env,
        anchorer: Address,
        site_id: BytesN<32>,
        period: u64,
        merkle_root: BytesN<32>,
    ) -> Result<(), AttendanceError> {
        anchorer.require_auth();
        Self::assert_not_paused(&env)?;

        let core_contract = Self::get_core_contract(env.clone())?;
        let core_client = CoreClient::new(&env, &core_contract);

        // Verify site is registered
        if !core_client.is_site_registered(&site_id) {
            return Err(AttendanceError::SiteNotRegistered);
        }

        // Verify caller is Anchorer, Admin, or the contract admin
        let is_admin = anchorer == Self::get_admin(env.clone())?;
        let has_anchorer_role = core_client.has_role(&anchorer, &Role::Anchorer);
        let has_admin_role = core_client.has_role(&anchorer, &Role::Admin);

        if !is_admin && !has_anchorer_role && !has_admin_role {
            return Err(AttendanceError::Unauthorized);
        }

        // Write-once invariant check
        let anchor_key = DataKey::Anchor(site_id.clone(), period);
        if env.storage().persistent().has(&anchor_key) {
            return Err(AttendanceError::AnchorAlreadyExists);
        }

        let record = AnchorRecord {
            merkle_root: merkle_root.clone(),
            submitted_by: anchorer,
            ledger_time: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&anchor_key, &record);

        env.events()
            .publish((symbol_short!("anchor"), site_id, period), merkle_root);

        Ok(())
    }

    /// Get an anchor record by site and period. Returns None if not anchored.
    pub fn get_anchor(env: Env, site_id: BytesN<32>, period: u64) -> Option<AnchorRecord> {
        let anchor_key = DataKey::Anchor(site_id, period);
        env.storage().persistent().get(&anchor_key)
    }

    /// Record an approved correction on-chain (four-eyes principle).
    pub fn record_correction(
        env: Env,
        caller: Address,
        site_id: BytesN<32>,
        correction_hash: BytesN<32>,
        approver: Address,
    ) -> Result<(), AttendanceError> {
        caller.require_auth();
        Self::assert_not_paused(&env)?;

        let core_contract = Self::get_core_contract(env.clone())?;
        let core_client = CoreClient::new(&env, &core_contract);

        // Caller must be HR or Admin, and approver must also have HR or Admin role
        let caller_is_hr = core_client.has_role(&caller, &Role::HR)
            || core_client.has_role(&caller, &Role::Admin)
            || caller == Self::get_admin(env.clone())?;
        let approver_is_hr = core_client.has_role(&approver, &Role::HR)
            || core_client.has_role(&approver, &Role::Admin)
            || approver == Self::get_admin(env.clone())?;

        if !caller_is_hr || !approver_is_hr {
            return Err(AttendanceError::Unauthorized);
        }

        if caller == approver {
            // Four-eyes principle: caller and approver must be distinct
            return Err(AttendanceError::InvalidCorrection);
        }

        let corr_key = DataKey::Correction(correction_hash.clone());
        if env.storage().persistent().has(&corr_key) {
            return Err(AttendanceError::AnchorAlreadyExists);
        }

        let record = CorrectionRecord {
            site_id: site_id.clone(),
            correction_hash: correction_hash.clone(),
            requested_by: caller,
            approved_by: approver,
            ledger_time: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&corr_key, &record);

        env.events().publish(
            (symbol_short!("correct"), site_id),
            correction_hash,
        );

        Ok(())
    }

    /// Emergency pause. Admin only.
    pub fn pause(env: Env, caller: Address) -> Result<(), AttendanceError> {
        caller.require_auth();
        Self::assert_is_admin(&env, &caller)?;
        env.storage().instance().set(&DataKey::Paused, &true);
        env.events().publish((symbol_short!("paused"),), true);
        Ok(())
    }

    /// Emergency unpause. Admin only.
    pub fn unpause(env: Env, caller: Address) -> Result<(), AttendanceError> {
        caller.require_auth();
        Self::assert_is_admin(&env, &caller)?;
        env.storage().instance().set(&DataKey::Paused, &false);
        env.events().publish((symbol_short!("unpaused"),), false);
        Ok(())
    }

    /// Check if paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    // --- Helpers ---
    fn assert_not_paused(env: &Env) -> Result<(), AttendanceError> {
        if Self::is_paused(env.clone()) {
            Err(AttendanceError::ContractPaused)
        } else {
            Ok(())
        }
    }

    fn assert_is_admin(env: &Env, caller: &Address) -> Result<(), AttendanceError> {
        let admin = Self::get_admin(env.clone())?;
        if *caller == admin {
            Ok(())
        } else {
            Err(AttendanceError::Unauthorized)
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use gateflow_core::{GateFlowCoreContract, GateFlowCoreContractClient, Role as CoreRole};
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    fn setup_test_contracts(
        env: &Env,
    ) -> (
        Address,
        Address,
        GateFlowCoreContractClient<'_>,
        GateFlowAttendanceContractClient<'_>,
        Address,
    ) {
        let admin = Address::generate(env);
        env.mock_all_auths();

        let core_id = env.register(GateFlowCoreContract, ());
        let core_client = GateFlowCoreContractClient::new(env, &core_id);
        core_client.initialize(&admin);

        let att_id = env.register(GateFlowAttendanceContract, ());
        let att_client = GateFlowAttendanceContractClient::new(env, &att_id);
        att_client.initialize(&admin, &core_id);

        let anchorer = Address::generate(env);
        core_client.add_role(&admin, &anchorer, &CoreRole::Anchorer);

        (admin, core_id, core_client, att_client, anchorer)
    }

    #[test]
    fn test_anchor_attendance_lifecycle() {
        let env = Env::default();
        let (admin, _core_id, core_client, att_client, anchorer) = setup_test_contracts(&env);

        let site_id = BytesN::from_array(&env, &[1u8; 32]);
        let merkle_root = BytesN::from_array(&env, &[9u8; 32]);
        let period: u64 = 1715000000;

        // Register site on core contract first
        core_client.register_site(&admin, &site_id);

        // Initial lookup should return None
        assert_eq!(att_client.get_anchor(&site_id, &period), None);

        // Submit anchor
        att_client.anchor_attendance(&anchorer, &site_id, &period, &merkle_root);

        // Lookup stored record
        let record = att_client.get_anchor(&site_id, &period).unwrap();
        assert_eq!(record.merkle_root, merkle_root);
        assert_eq!(record.submitted_by, anchorer);

        // Second attempt to anchor same site + period must fail (write-once)
        let dup = att_client.try_anchor_attendance(&anchorer, &site_id, &period, &merkle_root);
        assert_eq!(dup, Err(Ok(AttendanceError::AnchorAlreadyExists)));
    }

    #[test]
    fn test_anchor_unregistered_site_fails() {
        let env = Env::default();
        let (_admin, _core_id, _core_client, att_client, anchorer) = setup_test_contracts(&env);

        let site_id = BytesN::from_array(&env, &[2u8; 32]);
        let merkle_root = BytesN::from_array(&env, &[9u8; 32]);
        let period: u64 = 1715000000;

        // Site not registered in core
        let res = att_client.try_anchor_attendance(&anchorer, &site_id, &period, &merkle_root);
        assert_eq!(res, Err(Ok(AttendanceError::SiteNotRegistered)));
    }

    #[test]
    fn test_unauthorized_anchorer_fails() {
        let env = Env::default();
        let (admin, _core_id, core_client, att_client, _anchorer) = setup_test_contracts(&env);

        let site_id = BytesN::from_array(&env, &[3u8; 32]);
        core_client.register_site(&admin, &site_id);

        let random_caller = Address::generate(&env);
        let merkle_root = BytesN::from_array(&env, &[9u8; 32]);
        let period: u64 = 1715000000;

        let res = att_client.try_anchor_attendance(&random_caller, &site_id, &period, &merkle_root);
        assert_eq!(res, Err(Ok(AttendanceError::Unauthorized)));
    }

    #[test]
    fn test_correction_recording() {
        let env = Env::default();
        let (admin, _core_id, core_client, att_client, _anchorer) = setup_test_contracts(&env);

        let hr1 = Address::generate(&env);
        let hr2 = Address::generate(&env);
        core_client.add_role(&admin, &hr1, &CoreRole::HR);
        core_client.add_role(&admin, &hr2, &CoreRole::HR);

        let site_id = BytesN::from_array(&env, &[4u8; 32]);
        let corr_hash = BytesN::from_array(&env, &[5u8; 32]);

        // Same caller & approver violates four-eyes principle
        let same_res = att_client.try_record_correction(&hr1, &site_id, &corr_hash, &hr1);
        assert_eq!(same_res, Err(Ok(AttendanceError::InvalidCorrection)));

        // Distinct HRs succeed
        att_client.record_correction(&hr1, &site_id, &corr_hash, &hr2);

        // Duplicate correction fails
        let dup = att_client.try_record_correction(&hr1, &site_id, &corr_hash, &hr2);
        assert_eq!(dup, Err(Ok(AttendanceError::AnchorAlreadyExists)));
    }

    #[test]
    fn test_pause_blocks_anchoring() {
        let env = Env::default();
        let (admin, _core_id, core_client, att_client, anchorer) = setup_test_contracts(&env);

        let site_id = BytesN::from_array(&env, &[5u8; 32]);
        core_client.register_site(&admin, &site_id);

        att_client.pause(&admin);
        assert!(att_client.is_paused());

        let merkle_root = BytesN::from_array(&env, &[9u8; 32]);
        let res = att_client.try_anchor_attendance(&anchorer, &site_id, &100, &merkle_root);
        assert_eq!(res, Err(Ok(AttendanceError::ContractPaused)));

        att_client.unpause(&admin);
        assert!(!att_client.is_paused());

        att_client.anchor_attendance(&anchorer, &site_id, &100, &merkle_root);
        assert!(att_client.get_anchor(&site_id, &100).is_some());
    }
}
