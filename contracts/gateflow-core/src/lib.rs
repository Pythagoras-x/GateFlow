#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, BytesN, Env,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum CoreError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    ContractPaused = 4,
    SiteAlreadyRegistered = 5,
    SiteNotFound = 6,
    RoleAlreadyAssigned = 7,
    RoleNotFound = 8,
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
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Role(Address, Role),
    Site(BytesN<32>),
    Paused,
}

#[contract]
pub struct GateFlowCoreContract;

#[contractimpl]
impl GateFlowCoreContract {
    /// Initialize the contract with the primary admin address.
    pub fn initialize(env: Env, admin: Address) -> Result<(), CoreError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(CoreError::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Paused, &false);

        // Grant Admin role to initial admin
        env.storage()
            .persistent()
            .set(&DataKey::Role(admin.clone(), Role::Admin), &true);

        env.events().publish(
            (symbol_short!("init"),),
            admin,
        );

        Ok(())
    }

    /// Retrieve the current administrator address.
    pub fn get_admin(env: Env) -> Result<Address, CoreError> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(CoreError::NotInitialized)
    }

    /// Add a role to a target address. Caller must be an admin.
    pub fn add_role(
        env: Env,
        caller: Address,
        target: Address,
        role: Role,
    ) -> Result<(), CoreError> {
        caller.require_auth();
        Self::assert_not_paused(&env)?;
        Self::assert_is_admin(&env, &caller)?;

        let role_key = DataKey::Role(target.clone(), role);
        if env.storage().persistent().has(&role_key) {
            return Err(CoreError::RoleAlreadyAssigned);
        }

        env.storage().persistent().set(&role_key, &true);

        env.events().publish(
            (symbol_short!("role_add"), target),
            role as u32,
        );

        Ok(())
    }

    /// Remove a role from a target address. Caller must be an admin.
    pub fn remove_role(
        env: Env,
        caller: Address,
        target: Address,
        role: Role,
    ) -> Result<(), CoreError> {
        caller.require_auth();
        Self::assert_not_paused(&env)?;
        Self::assert_is_admin(&env, &caller)?;

        let role_key = DataKey::Role(target.clone(), role);
        if !env.storage().persistent().has(&role_key) {
            return Err(CoreError::RoleNotFound);
        }

        env.storage().persistent().remove(&role_key);

        env.events().publish(
            (symbol_short!("role_rem"), target),
            role as u32,
        );

        Ok(())
    }

    /// Check if target address holds the specified role.
    pub fn has_role(env: Env, target: Address, role: Role) -> bool {
        let role_key = DataKey::Role(target, role);
        env.storage().persistent().get(&role_key).unwrap_or(false)
    }

    /// Register a physical/logical site identifier. Caller must be admin.
    pub fn register_site(
        env: Env,
        caller: Address,
        site_id: BytesN<32>,
    ) -> Result<(), CoreError> {
        caller.require_auth();
        Self::assert_not_paused(&env)?;
        Self::assert_is_admin(&env, &caller)?;

        let site_key = DataKey::Site(site_id.clone());
        if env.storage().persistent().has(&site_key) {
            return Err(CoreError::SiteAlreadyRegistered);
        }

        env.storage().persistent().set(&site_key, &true);

        env.events().publish(
            (symbol_short!("site_reg"),),
            site_id,
        );

        Ok(())
    }

    /// Check if a site is registered.
    pub fn is_site_registered(env: Env, site_id: BytesN<32>) -> bool {
        let site_key = DataKey::Site(site_id);
        env.storage().persistent().get(&site_key).unwrap_or(false)
    }

    /// Emergency pause the contract. Caller must be admin.
    pub fn pause(env: Env, caller: Address) -> Result<(), CoreError> {
        caller.require_auth();
        Self::assert_is_admin(&env, &caller)?;

        env.storage().instance().set(&DataKey::Paused, &true);
        env.events().publish((symbol_short!("paused"),), true);
        Ok(())
    }

    /// Unpause the contract. Caller must be admin.
    pub fn unpause(env: Env, caller: Address) -> Result<(), CoreError> {
        caller.require_auth();
        Self::assert_is_admin(&env, &caller)?;

        env.storage().instance().set(&DataKey::Paused, &false);
        env.events().publish((symbol_short!("unpaused"),), false);
        Ok(())
    }

    /// Check if contract is paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    // --- Internal Helpers ---
    fn assert_not_paused(env: &Env) -> Result<(), CoreError> {
        if Self::is_paused(env.clone()) {
            Err(CoreError::ContractPaused)
        } else {
            Ok(())
        }
    }

    fn assert_is_admin(env: &Env, caller: &Address) -> Result<(), CoreError> {
        let admin = Self::get_admin(env.clone())?;
        if *caller == admin || Self::has_role(env.clone(), caller.clone(), Role::Admin) {
            Ok(())
        } else {
            Err(CoreError::Unauthorized)
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    #[test]
    fn test_initialize_and_admin() {
        let env = Env::default();
        let contract_id = env.register(GateFlowCoreContract, ());
        let client = GateFlowCoreContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        env.mock_all_auths();

        client.initialize(&admin);

        assert_eq!(client.get_admin(), admin);
        assert!(client.has_role(&admin, &Role::Admin));

        // Re-initializing should fail
        let result = client.try_initialize(&admin);
        assert_eq!(result, Err(Ok(CoreError::AlreadyInitialized)));
    }

    #[test]
    fn test_role_management() {
        let env = Env::default();
        let contract_id = env.register(GateFlowCoreContract, ());
        let client = GateFlowCoreContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let anchorer = Address::generate(&env);
        let hr = Address::generate(&env);
        let security = Address::generate(&env);
        env.mock_all_auths();

        client.initialize(&admin);

        assert!(!client.has_role(&anchorer, &Role::Anchorer));
        client.add_role(&admin, &anchorer, &Role::Anchorer);
        assert!(client.has_role(&anchorer, &Role::Anchorer));

        client.add_role(&admin, &hr, &Role::HR);
        assert!(client.has_role(&hr, &Role::HR));

        client.add_role(&admin, &security, &Role::Security);
        assert!(client.has_role(&security, &Role::Security));

        // Duplicate addition fails
        let dup = client.try_add_role(&admin, &anchorer, &Role::Anchorer);
        assert_eq!(dup, Err(Ok(CoreError::RoleAlreadyAssigned)));

        // Remove role
        client.remove_role(&admin, &anchorer, &Role::Anchorer);
        assert!(!client.has_role(&anchorer, &Role::Anchorer));

        // Non-admin cannot add roles
        let unauthorized_res = client.try_add_role(&anchorer, &hr, &Role::Host);
        assert_eq!(unauthorized_res, Err(Ok(CoreError::Unauthorized)));
    }

    #[test]
    fn test_site_registration() {
        let env = Env::default();
        let contract_id = env.register(GateFlowCoreContract, ());
        let client = GateFlowCoreContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let site_id = BytesN::from_array(&env, &[7u8; 32]);
        env.mock_all_auths();

        client.initialize(&admin);

        assert!(!client.is_site_registered(&site_id));
        client.register_site(&admin, &site_id);
        assert!(client.is_site_registered(&site_id));

        // Duplicate registration fails
        let dup_site = client.try_register_site(&admin, &site_id);
        assert_eq!(dup_site, Err(Ok(CoreError::SiteAlreadyRegistered)));
    }

    #[test]
    fn test_pause_unpause() {
        let env = Env::default();
        let contract_id = env.register(GateFlowCoreContract, ());
        let client = GateFlowCoreContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let site_id = BytesN::from_array(&env, &[3u8; 32]);
        env.mock_all_auths();

        client.initialize(&admin);
        assert!(!client.is_paused());

        client.pause(&admin);
        assert!(client.is_paused());

        // Actions blocked when paused
        let res = client.try_register_site(&admin, &site_id);
        assert_eq!(res, Err(Ok(CoreError::ContractPaused)));

        client.unpause(&admin);
        assert!(!client.is_paused());

        client.register_site(&admin, &site_id);
        assert!(client.is_site_registered(&site_id));
    }
}
