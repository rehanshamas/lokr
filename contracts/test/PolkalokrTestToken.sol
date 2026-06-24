// contracts/PolkalokrTestToken.sol
// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20SnapshotUpgradeable.sol";

contract PolkalokrTestToken is ERC20Upgradeable, UUPSUpgradeable, OwnableUpgradeable, ERC20PausableUpgradeable, ERC20SnapshotUpgradeable {
    function initialize(uint256 _amount) initializer public {
      __ERC20_init("PolkalokrTestToken", "PLKTT");
      __Ownable_init();
      _mint(msg.sender, _amount * 10 ** decimals());
      _snapshot();
    }
    
    /**
     * @notice Mint `amount` tokens to `account`
     */ 
    function mintTo(address account, uint256 amount) external returns (bool) {
        _mint(account, amount);
        return true;
    }

    /**
     * @notice Get the current snapshotId
     */ 
    function getCurrentSnapshotId() external view returns (uint256) {
        return _getCurrentSnapshotId();
    }

    /**
     * @notice Make a snapshot
     */ 
    function snapshot() external {
        _snapshot();
    }

    function pause(bool value) external {
        if(value) {
            _pause();
        } else{
            _unpause();
        }
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function _beforeTokenTransfer(
        address from, 
        address to, 
        uint256 amount
    ) 
        internal 
        override(
            ERC20Upgradeable, 
            ERC20PausableUpgradeable, 
            ERC20SnapshotUpgradeable
        ) 
    {
        super._beforeTokenTransfer(from, to, amount);
    }


}