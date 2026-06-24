// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestERC20 is ERC20 {
    uint8 private _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(uint256 amount) external returns (bool) {
        _mint(_msgSender(), amount);
        return true;
    }

    function mint(address account, uint256 amount) external returns (bool) {
        _mint(account, amount);
        return true;
    }
    
    function allocateTo(address account, uint256 amount) external {
        _mint(account, amount);
    } 

}