// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

import "../common/BaseGovernanceWithUserUpgradable.sol";
import "../interfaces/ILock.sol";

interface IUpkeepConsumer {
  function listenTriggered(uint index, address lockAddress) external;
}

contract EventUnlockSchedule is BaseGovernanceWithUserUpgradable, KeeperCompatibleInterface {
    
    uint256 constant EXP = 1e18;

    uint256 public lockStartTime;
    uint256 public lockEndTime;

    uint256[] public conditions;
    int256[] public offsetPrices;
    uint256[] public amounts;
    uint256 public amountsUnlocked;

    address public feedAddr;

    bool public ownerCanWithdraw;

    ILock public lockContract;
    AggregatorV3Interface internal priceFeed;

    function initialize(ILock lock, bytes calldata data) public initializer {
        (
            uint256 _lockStartTime,
            uint256 _lockEndTime,
            uint256[] memory _conditions, 
            int256[] memory _offsetPrices, 
            uint256[] memory _amounts, 
            address _feedAddress,
            address governanceAddress,
            bool _ownerCanWithdraw
        ) = abi.decode(
            data, 
            (
                uint256,
                uint256,
                uint256[], 
                int256[],
                uint256[],
                address,
                address,
                bool
            )
        );
        __EventUnlockSchedule_init(lock, _lockStartTime, _lockEndTime, _conditions, _offsetPrices, _amounts, _feedAddress, governanceAddress, _ownerCanWithdraw);
    }

    function __EventUnlockSchedule_init(ILock _lock, uint256 _lockStartTime, uint256 _lockEndTime, uint256[] memory _conditions, int256[] memory _offsetPrices, uint256[] memory _amounts, address _feedAddress, address governanceAddress, bool _ownerCanWithdraw) internal onlyInitializing {
        __BaseGovernanceWithUser_init(governanceAddress);
        __EventUnlockSchedule_init_unchained(_lock, _lockStartTime, _lockEndTime, _conditions, _offsetPrices, _amounts, _feedAddress, _ownerCanWithdraw);
    }

    function __EventUnlockSchedule_init_unchained(ILock _lock, uint256 _lockStartTime, uint256 _lockEndTime, uint256[] memory _conditions, int256[] memory _offsetPrices, uint256[] memory _amounts, address _feedAddress, bool _ownerCanWithdraw) internal onlyInitializing {
        require(_offsetPrices.length > 0 && _conditions.length > 0, "ERROR: There must be atleast one event added");
        require(_offsetPrices.length < 100 && _conditions.length < 100, "ERROR: Can not add more than 100 events");
        require(_offsetPrices.length == _conditions.length, "ERROR: Lenght of offsetPrices and conditions must be equal");
        require(_conditions.length == _amounts.length, "ERROR: Lenght of conditions and amounts must be equal");
        require(_checkAmounts(_amounts), "ERROR: Amount are not correctly normalized");
        lockContract = _lock;
        lockStartTime = _lockStartTime;
        lockEndTime = _lockEndTime;
        conditions = _conditions;
        offsetPrices = _offsetPrices;
        feedAddr = _feedAddress;
        priceFeed = AggregatorV3Interface(_feedAddress);
        amounts = _amounts;
        ownerCanWithdraw = _ownerCanWithdraw;
    }
    
    /**
     * @notice Calculate the amount of unlocked tokens
     * @dev The lock contract pass the arguments
     * @param _initialAmount Initial amount of the lock
     * @return _unlockedAmount The unlocked tokens
     */
    function unlockedAmount(uint256 _initialAmount) external view returns (uint256) {
        if(block.timestamp >= lockEnd() && !ownerCanWithdraw) {
            return _initialAmount;
        }
        return _initialAmount * amountsUnlocked / EXP;
    }
    
    /**
     * @notice Function that get the timestamp when the lock will start
     * @return Timestamp when the lock start
     */
    function lockStart() public view returns(uint256) {
        return lockStartTime;
    }

    /**
     * @notice Function that get the timestamp when the lock will finish
     * @return Timestamp when the lock end
     */
    function lockEnd() public view returns(uint256) {
        return lockEndTime;
    }

    /**
     * @notice Function that get the withdraw capability for BeneficiaryManager
     * @dev Second argument should return True in EventSchedule and False in all time based schedules
     * @return Tuple ((bool,bool)(ifOwnerCanWithdrawOnLockEnd,trueIfEventUnlockSchedule))
     */
    function withdrawCapability() external view returns(bool,bool){
        return (ownerCanWithdraw, true/*true only if EventScheduler*/);
    }

    function _checkAmounts(uint256[] memory _amounts) internal pure returns(bool) {
        uint256 total;
        for(uint256 i; i < _amounts.length; ) {
            total += _amounts[i];
            unchecked {
                ++i;
            }
        }
        return total == EXP;
    }
    function _totalAmountLocked(uint256[] memory _amounts) internal pure returns(uint256) {
        uint256 total;
        for(uint256 i; i < _amounts.length; ) {
            total += _amounts[i];
            unchecked {
                ++i;
            }
        }
        return total;
    }
    
    function checkUpkeep(bytes calldata checkData) external view override returns (bool upkeepNeeded, bytes memory performData) {

        (
            address lockAddress,
            address upkeepConsumer
        ) = abi.decode(
            checkData, 
            (
                address,
                address
            )
        );

        int price = _getPrice();
        upkeepNeeded = false;

        if(block.timestamp < lockStart()){
            //only when lock start time not reached
            upkeepNeeded = false;
        }else{
            if(block.timestamp >= lockEnd()){
                //only when lock end time reaches
                upkeepNeeded = !ownerCanWithdraw && amountsUnlocked < _totalAmountLocked(amounts);
            }else{
                if(offsetPrices.length > 0){
                    for(uint256 i; i < offsetPrices.length; ) {
                        if(conditions[i] == 0){
                            if(price == offsetPrices[i]){
                                upkeepNeeded = true;
                            }
                        }
                        if(conditions[i] == 1){
                            if(price < offsetPrices[i]){
                                upkeepNeeded = true;
                            }
                        }
                        if(conditions[i] == 2){
                            if(price > offsetPrices[i]){
                                upkeepNeeded = true;
                            }
                        }
                        unchecked {
                            ++i;
                        }
                    }
                }
            }
        }
        performData = abi.encode(lockAddress,upkeepConsumer);
        return (upkeepNeeded, performData);
    }
    function performUpkeep(bytes calldata performData) external override {
        (
            address _lockAddress,
            address _upkeepConsumer
        ) = abi.decode(
            performData, 
            (
                address,
                address
            )
        );

        int price = _getPrice();

        if(block.timestamp >= lockStart()){
            //only when lock start time reaches
            if(block.timestamp < lockEnd()){
                if(offsetPrices.length > 0){
                    uint32 i;
                    while (i < offsetPrices.length) {
                        bool isFulfilled = false;
                        if(conditions[i] == 0){
                            if(price == offsetPrices[i]){
                                isFulfilled = true;
                            }
                        }
                        if(conditions[i] == 1){
                            if(price < offsetPrices[i]){
                                isFulfilled = true;
                            }
                        }
                        if(conditions[i] == 2){
                            if(price > offsetPrices[i]){
                                isFulfilled = true;
                            }
                        }
                        if(isFulfilled){
                            _unlockAmounts(i, _lockAddress, _upkeepConsumer);
                            i=0;
                        }else{
                            i++;
                        }
                    }
                }
            }else{
                //only when lock end time reaches
                if(!ownerCanWithdraw){
                    uint256 totalAmountLocked = _totalAmountLocked(amounts);
                    _unlockAllAmount(totalAmountLocked);
                }
            }
        }
    }
    function _unlockAmounts(uint _index, address _lockAddress, address _upkeepConsumer) internal {
        _updateAmountsUnlocked(amounts[_index]);
        _removeEventSchedule(_index);
        IUpkeepConsumer(_upkeepConsumer).listenTriggered(_index, _lockAddress);
    }
    function _updateAmountsUnlocked(uint256 _amount) internal {
        amountsUnlocked += _amount;
    }
    function _unlockAllAmount(uint256 _amount) internal {
        amountsUnlocked = _amount;
    }
    function _removeEventSchedule(uint _idx) internal {
        
        require(_idx < offsetPrices.length, "ERROR: index out of bound");
        
        for(uint256 i = _idx; i < offsetPrices.length-1; ){
            offsetPrices[i] = offsetPrices[i+1];
            conditions[i] = conditions[i+1];
            amounts[i] = amounts[i+1];
            unchecked {
                ++i;
            }
        }
        offsetPrices.pop();
        conditions.pop();
        amounts.pop();
    }

    function _getPrice() internal view returns (int) {
        (
            ,int price,,uint timeStamp,
        ) = priceFeed.latestRoundData();
        require(timeStamp > 0, "Round not complete");
        return price;
    }
}