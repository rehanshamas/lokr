// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import {KeeperRegistryInterface, State, Config} from "@chainlink/contracts/src/v0.8/interfaces/KeeperRegistryInterface.sol";
import {LinkTokenInterface} from "@chainlink/contracts/src/v0.8/interfaces/LinkTokenInterface.sol";

interface KeeperRegistrarInterface {
  function register(
    string memory name,
    bytes calldata encryptedEmail,
    address upkeepContract,
    uint32 gasLimit,
    address adminAddress,
    bytes calldata checkData,
    uint96 amount,
    uint8 source,
    address sender
  ) external;
}

contract UpkeepConsumer {
  LinkTokenInterface public immutable i_link;
  address public immutable registrar;
  KeeperRegistryInterface public immutable i_registry;
  bytes4 registerSig = KeeperRegistrarInterface.register.selector;

  event Registered(uint256 upkeepID);
  event Triggered(uint index, address lockAddress);

  constructor(
    LinkTokenInterface _link,
    address _registrar,
    KeeperRegistryInterface _registry
  ) {
    i_link = _link;
    registrar = _registrar;
    i_registry = _registry;
  }

  function registerAndPredictID(
    string memory name,
    bytes calldata encryptedEmail,
    address upkeepContract,
    uint32 gasLimit,
    address adminAddress,
    bytes calldata checkData,
    uint96 amount,
    uint8 source
  ) public {
    (State memory state, Config memory _c, address[] memory _k) = i_registry.getState();
    uint256 oldNonce = state.nonce;
    bytes memory payload = abi.encode(
      name,
      encryptedEmail,
      upkeepContract,
      gasLimit,
      adminAddress,
      checkData,
      amount,
      source,
      address(this)
    );
    
    i_link.transferAndCall(registrar, amount, bytes.concat(registerSig, payload));
    (state, _c, _k) = i_registry.getState();
    uint256 newNonce = state.nonce;
    if (newNonce == oldNonce + 1) {
      uint256 upkeepID = uint256(
        keccak256(abi.encodePacked(blockhash(block.number - 1), address(i_registry), uint32(oldNonce)))
      );
      emit Registered(upkeepID);
    } else {
      revert("auto-approve disabled");
    }
  }
  function listenTriggered(uint index, address lockAddress) external {
    emit Triggered(index, lockAddress);
  }
}