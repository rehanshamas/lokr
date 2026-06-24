// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";

/**
 * @title Base contract which can be upgraded by Governance 
 */
abstract contract BaseGovernanceUpgradable is Initializable, ContextUpgradeable, UUPSUpgradeable, AccessControlUpgradeable {

    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");

    function __BaseGovernance_init(address governer) internal onlyInitializing {
        __Context_init_unchained();
        __ERC165_init_unchained();
        __ERC1967Upgrade_init_unchained();
        __UUPSUpgradeable_init_unchained();
        __AccessControl_init_unchained();
        __BaseGovernance_init_unchained(governer);
    }

    function __BaseGovernance_init_unchained(address governer) internal onlyInitializing {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());   // Grant DEFAULT_ADMIN to creator. Other role management scan be performed elswhere
        _setupRole(GOVERNANCE_ROLE, governer);
    }

    function _authorizeUpgrade(address /*newImplementation*/) internal virtual override {
        require(
            hasRole(GOVERNANCE_ROLE, msg.sender),
            "ERROR: Upgrade not authorized"
        );
    }
    
    uint256[50] private __gap;
}