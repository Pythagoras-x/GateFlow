#![no_std]
use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, symbol_short, Address,
    BytesN, Env,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum VisitorsError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    ContractPaused = 4,
    PassAlreadyExists = 5,
    PassNotFound = 6,
    SiteNotRegistered = 7,
    PassExpired = 8,
    PassNotYetValid = 9,
    PassRevoked = 10,
    PassAlreadyUsed = 11,
    InvalidValidityPeriod = 12,
    InvalidPassState = 13,
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

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PassStatus {
    Active = 1,
    Entered = 2,
    Exited = 3,
    Revoked = 4,
}

#[contractclient(name = "CoreClient")]
pub trait CoreContractInterface {
    fn has_role(env: &Env, target: Address, role: Role) -> bool;
    fn is_site_registered(env: &Env, site_id: BytesN<32>) -> bool;
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PassRecord {
    pub pass_hash: BytesN<32>,
    pub host: Address,
    pub site_id: BytesN<32>,
    pub valid_from: u64,
    pub valid_until: u64,
    pub status: PassStatus,
    pub entry_time: u64,
    pub exit_time: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    CoreContract,
    Pass(BytesN<32>),
    Paused,
}

#[contract]
pub struct GateFlowVisitorsContract;

#[contractimpl]
impl GateFlowVisitorsContract {
    /// Initialize the visitors pass contract with admin and core contract addresses.
    pub fn initialize(
        env: Env,
        admin: Address,
        core_contract: Address,
    ) -> Result<(), VisitorsError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(VisitorsError::AlreadyInitialized);
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
    pub fn get_admin(env: Env) -> Result<Address, VisitorsError> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(VisitorsError::NotInitialized)
    }

    /// Retrieve the core contract address.
    pub fn get_core_contract(env: Env) -> Result<Address, VisitorsError> {
        env.storage()
            .instance()
            .get(&DataKey::CoreContract)
            .ok_or(VisitorsError::NotInitialized)
    }

    /// Issue a new visitor pass. Caller must have Host or Admin role on Core contract.
    pub fn issue_pass(
        env: Env,
        host: Address,
        pass_id: BytesN<32>,
        pass_hash: BytesN<32>,
        site_id: BytesN<32>,
        valid_from: u64,
        valid_until: u64,
    ) -> Result<(), VisitorsError> {
        host.require_auth();
        Self::assert_not_paused(&env)?;

        if valid_until <= valid_from {
            return Err(VisitorsError::InvalidValidityPeriod);
        }

        let core_address = Self::get_core_contract(env.clone())?;
        let core_client = CoreClient::new(&env, &core_address);

        let is_host = core_client.has_role(&host, &Role::Host);
        let is_admin = core_client.has_role(&host, &Role::Admin);
        if !is_host && !is_admin {
            return Err(VisitorsError::Unauthorized);
        }

        if !core_client.is_site_registered(&site_id) {
            return Err(VisitorsError::SiteNotRegistered);
        }

        let pass_key = DataKey::Pass(pass_id.clone());
        if env.storage().persistent().has(&pass_key) {
            return Err(VisitorsError::PassAlreadyExists);
        }

        let record = PassRecord {
            pass_hash,
            host: host.clone(),
            site_id,
            valid_from,
            valid_until,
            status: PassStatus::Active,
            entry_time: 0,
            exit_time: 0,
        };

        env.storage().persistent().set(&pass_key, &record);

        env.events().publish(
            (symbol_short!("pass_iss"), pass_id),
            host,
        );

        Ok(())
    }

    /// Record visitor entry at the gate. Caller must have Security or Admin role.
    pub fn record_entry(
        env: Env,
        guard: Address,
        pass_id: BytesN<32>,
    ) -> Result<(), VisitorsError> {
        guard.require_auth();
        Self::assert_not_paused(&env)?;

        let core_address = Self::get_core_contract(env.clone())?;
        let core_client = CoreClient::new(&env, &core_address);

        let is_security = core_client.has_role(&guard, &Role::Security);
        let is_admin = core_client.has_role(&guard, &Role::Admin);
        if !is_security && !is_admin {
            return Err(VisitorsError::Unauthorized);
        }

        let pass_key = DataKey::Pass(pass_id.clone());
        let mut record: PassRecord = env
            .storage()
            .persistent()
            .get(&pass_key)
            .ok_or(VisitorsError::PassNotFound)?;

        if record.status == PassStatus::Revoked {
            return Err(VisitorsError::PassRevoked);
        }
        if record.status == PassStatus::Entered {
            return Err(VisitorsError::PassAlreadyUsed);
        }
        if record.status == PassStatus::Exited {
            return Err(VisitorsError::PassAlreadyUsed);
        }

        let current_time = env.ledger().timestamp();
        if current_time < record.valid_from {
            return Err(VisitorsError::PassNotYetValid);
        }
        if current_time > record.valid_until {
            return Err(VisitorsError::PassExpired);
        }

        record.status = PassStatus::Entered;
        record.entry_time = current_time;

        env.storage().persistent().set(&pass_key, &record);

        env.events().publish(
            (symbol_short!("entry"), pass_id),
            guard,
        );

        Ok(())
    }

    /// Record visitor exit at the gate. Caller must have Security or Admin role.
    pub fn record_exit(
        env: Env,
        guard: Address,
        pass_id: BytesN<32>,
    ) -> Result<(), VisitorsError> {
        guard.require_auth();
        Self::assert_not_paused(&env)?;

        let core_address = Self::get_core_contract(env.clone())?;
        let core_client = CoreClient::new(&env, &core_address);

        let is_security = core_client.has_role(&guard, &Role::Security);
        let is_admin = core_client.has_role(&guard, &Role::Admin);
        if !is_security && !is_admin {
            return Err(VisitorsError::Unauthorized);
        }

        let pass_key = DataKey::Pass(pass_id.clone());
        let mut record: PassRecord = env
            .storage()
            .persistent()
            .get(&pass_key)
            .ok_or(VisitorsError::PassNotFound)?;

        if record.status != PassStatus::Entered {
            return Err(VisitorsError::InvalidPassState);
        }

        let current_time = env.ledger().timestamp();
        record.status = PassStatus::Exited;
        record.exit_time = current_time;

        env.storage().persistent().set(&pass_key, &record);

        env.events().publish(
            (symbol_short!("exit"), pass_id),
            guard,
        );

        Ok(())
    }

    /// Revoke a visitor pass. Caller must be the pass host OR have Admin role on Core contract.
    pub fn revoke_pass(
        env: Env,
        caller: Address,
        pass_id: BytesN<32>,
    ) -> Result<(), VisitorsError> {
        caller.require_auth();
        Self::assert_not_paused(&env)?;

        let pass_key = DataKey::Pass(pass_id.clone());
        let mut record: PassRecord = env
            .storage()
            .persistent()
            .get(&pass_key)
            .ok_or(VisitorsError::PassNotFound)?;

        if record.status == PassStatus::Revoked {
            return Err(VisitorsError::PassRevoked);
        }

        let core_address = Self::get_core_contract(env.clone())?;
        let core_client = CoreClient::new(&env, &core_address);
        let is_admin = core_client.has_role(&caller, &Role::Admin);
        let is_host = caller == record.host;

        if !is_host && !is_admin {
            return Err(VisitorsError::Unauthorized);
        }

        record.status = PassStatus::Revoked;
        env.storage().persistent().set(&pass_key, &record);

        env.events().publish(
            (symbol_short!("pass_rev"), pass_id),
            caller,
        );

        Ok(())
    }

    /// Verify a pass record (read-only query). Returns full pass record if found.
    pub fn verify_pass(env: Env, pass_id: BytesN<32>) -> Option<PassRecord> {
        env.storage().persistent().get(&DataKey::Pass(pass_id))
    }

    /// Pause the contract. Admin only.
    pub fn pause(env: Env, admin: Address) -> Result<(), VisitorsError> {
        admin.require_auth();
        Self::assert_is_admin(&env, &admin)?;
        env.storage().instance().set(&DataKey::Paused, &true);
        env.events().publish((symbol_short!("pause"),), admin);
        Ok(())
    }

    /// Unpause the contract. Admin only.
    pub fn unpause(env: Env, admin: Address) -> Result<(), VisitorsError> {
        admin.require_auth();
        Self::assert_is_admin(&env, &admin)?;
        env.storage().instance().set(&DataKey::Paused, &false);
        env.events().publish((symbol_short!("unpause"),), admin);
        Ok(())
    }

    /// Check if the contract is paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    // --- Helpers ---
    fn assert_not_paused(env: &Env) -> Result<(), VisitorsError> {
        if Self::is_paused(env.clone()) {
            Err(VisitorsError::ContractPaused)
        } else {
            Ok(())
        }
    }

    fn assert_is_admin(env: &Env, caller: &Address) -> Result<(), VisitorsError> {
        let admin = Self::get_admin(env.clone())?;
        if *caller == admin {
            Ok(())
        } else {
            Err(VisitorsError::Unauthorized)
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use gateflow_core::{GateFlowCoreContract, GateFlowCoreContractClient, Role as CoreRole};
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::Env;

    fn setup_test_contracts(
        env: &Env,
    ) -> (
        Address,
        Address,
        GateFlowCoreContractClient<'_>,
        GateFlowVisitorsContractClient<'_>,
        Address,
        Address,
    ) {
        let admin = Address::generate(env);
        env.mock_all_auths();

        let core_id = env.register(GateFlowCoreContract, ());
        let core_client = GateFlowCoreContractClient::new(env, &core_id);
        core_client.initialize(&admin);

        let visitors_id = env.register(GateFlowVisitorsContract, ());
        let visitors_client = GateFlowVisitorsContractClient::new(env, &visitors_id);
        visitors_client.initialize(&admin, &core_id);

        let host = Address::generate(env);
        core_client.add_role(&admin, &host, &CoreRole::Host);

        let guard = Address::generate(env);
        core_client.add_role(&admin, &guard, &CoreRole::Security);

        (admin, core_id, core_client, visitors_client, host, guard)
    }

    #[test]
    fn test_issue_and_verify_pass_lifecycle() {
        let env = Env::default();
        let (admin, _core_id, core_client, visitors_client, host, guard) =
            setup_test_contracts(&env);

        let site_id = BytesN::from_array(&env, &[1u8; 32]);
        core_client.register_site(&admin, &site_id);

        let pass_id = BytesN::from_array(&env, &[2u8; 32]);
        let pass_hash = BytesN::from_array(&env, &[3u8; 32]);

        env.ledger().set_timestamp(1000);
        let valid_from = 500;
        let valid_until = 2000;

        // Verify pass does not exist initially
        assert_eq!(visitors_client.verify_pass(&pass_id), None);

        // Issue pass
        visitors_client.issue_pass(
            &host,
            &pass_id,
            &pass_hash,
            &site_id,
            &valid_from,
            &valid_until,
        );

        let record = visitors_client.verify_pass(&pass_id).unwrap();
        assert_eq!(record.pass_hash, pass_hash);
        assert_eq!(record.host, host);
        assert_eq!(record.site_id, site_id);
        assert_eq!(record.status, PassStatus::Active);

        // Record Entry
        visitors_client.record_entry(&guard, &pass_id);
        let entered_record = visitors_client.verify_pass(&pass_id).unwrap();
        assert_eq!(entered_record.status, PassStatus::Entered);
        assert_eq!(entered_record.entry_time, 1000);

        // Duplicate entry must fail
        let dup_entry = visitors_client.try_record_entry(&guard, &pass_id);
        assert_eq!(dup_entry, Err(Ok(VisitorsError::PassAlreadyUsed)));

        // Advance time and Record Exit
        env.ledger().set_timestamp(1500);
        visitors_client.record_exit(&guard, &pass_id);
        let exited_record = visitors_client.verify_pass(&pass_id).unwrap();
        assert_eq!(exited_record.status, PassStatus::Exited);
        assert_eq!(exited_record.exit_time, 1500);
    }

    #[test]
    fn test_pass_revocation_by_host_and_admin() {
        let env = Env::default();
        let (admin, _core_id, core_client, visitors_client, host, guard) =
            setup_test_contracts(&env);

        let site_id = BytesN::from_array(&env, &[1u8; 32]);
        core_client.register_site(&admin, &site_id);

        let pass_id1 = BytesN::from_array(&env, &[10u8; 32]);
        let pass_hash1 = BytesN::from_array(&env, &[11u8; 32]);
        let pass_id2 = BytesN::from_array(&env, &[20u8; 32]);
        let pass_hash2 = BytesN::from_array(&env, &[21u8; 32]);

        env.ledger().set_timestamp(1000);

        visitors_client.issue_pass(&host, &pass_id1, &pass_hash1, &site_id, &500, &2000);
        visitors_client.issue_pass(&host, &pass_id2, &pass_hash2, &site_id, &500, &2000);

        // Revoke pass1 by host
        visitors_client.revoke_pass(&host, &pass_id1);
        let rec1 = visitors_client.verify_pass(&pass_id1).unwrap();
        assert_eq!(rec1.status, PassStatus::Revoked);

        // Entry with revoked pass must fail
        let entry_res = visitors_client.try_record_entry(&guard, &pass_id1);
        assert_eq!(entry_res, Err(Ok(VisitorsError::PassRevoked)));

        // Revoke pass2 by admin
        visitors_client.revoke_pass(&admin, &pass_id2);
        let rec2 = visitors_client.verify_pass(&pass_id2).unwrap();
        assert_eq!(rec2.status, PassStatus::Revoked);

        // Random caller cannot revoke
        let random_caller = Address::generate(&env);
        let pass_id3 = BytesN::from_array(&env, &[30u8; 32]);
        let pass_hash3 = BytesN::from_array(&env, &[31u8; 32]);
        visitors_client.issue_pass(&host, &pass_id3, &pass_hash3, &site_id, &500, &2000);
        let unauth = visitors_client.try_revoke_pass(&random_caller, &pass_id3);
        assert_eq!(unauth, Err(Ok(VisitorsError::Unauthorized)));
    }

    #[test]
    fn test_time_validity_checks() {
        let env = Env::default();
        let (admin, _core_id, core_client, visitors_client, host, guard) =
            setup_test_contracts(&env);

        let site_id = BytesN::from_array(&env, &[1u8; 32]);
        core_client.register_site(&admin, &site_id);

        let pass_id = BytesN::from_array(&env, &[40u8; 32]);
        let pass_hash = BytesN::from_array(&env, &[41u8; 32]);

        // Invalid period (until <= from)
        let invalid_period =
            visitors_client.try_issue_pass(&host, &pass_id, &pass_hash, &site_id, &2000, &1000);
        assert_eq!(
            invalid_period,
            Err(Ok(VisitorsError::InvalidValidityPeriod))
        );

        // Issue with valid from 1000 to 2000
        visitors_client.issue_pass(&host, &pass_id, &pass_hash, &site_id, &1000, &2000);

        // Try entry before valid_from (timestamp = 800)
        env.ledger().set_timestamp(800);
        let early_res = visitors_client.try_record_entry(&guard, &pass_id);
        assert_eq!(early_res, Err(Ok(VisitorsError::PassNotYetValid)));

        // Try entry after valid_until (timestamp = 2500)
        env.ledger().set_timestamp(2500);
        let late_res = visitors_client.try_record_entry(&guard, &pass_id);
        assert_eq!(late_res, Err(Ok(VisitorsError::PassExpired)));
    }

    #[test]
    fn test_unauthorized_host_and_guard_fail() {
        let env = Env::default();
        let (admin, _core_id, core_client, visitors_client, _host, _guard) =
            setup_test_contracts(&env);

        let site_id = BytesN::from_array(&env, &[1u8; 32]);
        core_client.register_site(&admin, &site_id);

        let random_host = Address::generate(&env);
        let pass_id = BytesN::from_array(&env, &[50u8; 32]);
        let pass_hash = BytesN::from_array(&env, &[51u8; 32]);

        let res = visitors_client.try_issue_pass(
            &random_host,
            &pass_id,
            &pass_hash,
            &site_id,
            &100,
            &200,
        );
        assert_eq!(res, Err(Ok(VisitorsError::Unauthorized)));
    }

    #[test]
    fn test_pause_unpause() {
        let env = Env::default();
        let (admin, _core_id, core_client, visitors_client, host, _guard) =
            setup_test_contracts(&env);

        let site_id = BytesN::from_array(&env, &[1u8; 32]);
        core_client.register_site(&admin, &site_id);

        visitors_client.pause(&admin);
        assert!(visitors_client.is_paused());

        let pass_id = BytesN::from_array(&env, &[60u8; 32]);
        let pass_hash = BytesN::from_array(&env, &[61u8; 32]);
        let res =
            visitors_client.try_issue_pass(&host, &pass_id, &pass_hash, &site_id, &100, &200);
        assert_eq!(res, Err(Ok(VisitorsError::ContractPaused)));

        visitors_client.unpause(&admin);
        assert!(!visitors_client.is_paused());
    }
}
