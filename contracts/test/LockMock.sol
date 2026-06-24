// contracts/Lock.sol
// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "../common/BaseGovernanceWithUserUpgradable.sol";
import "../interfaces/IDepositManager.sol";
import "../interfaces/IUnlockSchedule.sol";
import "../interfaces/ISplitManager.sol";

import "hardhat/console.sol";

// TODO Add events

contract LockMock is BaseGovernanceWithUserUpgradable, ERC721Upgradeable {
    string constant NAME = "Polkalokr Lock";
    string constant SYMBOL = "LKR-LOCK";
    string internal constant ALREADY_LOCKED = "NFT already locked";
    string internal constant NOT_LOCKED = "No NFT locked";
    string internal constant AMOUNT_ZERO = "Amount can not be 0";
    string internal constant NOT_APROVED = "You are not the owner or are approved for this NFT";
    
    uint256 public lockStartTime;
    uint256 totalIDs;

    bool public canAddBeneficiaries;
    bool public canRemoveBeneficiaries;
    bool public canTransfer;

    bytes32 public constant BENEFICIARY_MANAGER_ROLE = keccak256("BENEFICIARY_MANAGER_ROLE");
    bytes32 public constant DEPOSIT_MANAGER_ROLE = keccak256("DEPOSIT_MANAGER_ROLE");

    IUnlockSchedule public schedule;
    IDepositManager public depositManager;
    ISplitManager public splitManager;

    IERC20Upgradeable public tokenERC20;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    modifier onlyBeneficiaryManager() {
        require(hasRole(BENEFICIARY_MANAGER_ROLE, _msgSender()), "ERROR: You are nor the Beneficiary Manager");
        _;
    }
    modifier onlyDepositManager() {
        require(hasRole(DEPOSIT_MANAGER_ROLE, _msgSender()), "ERROR: Only the DepositManager");
        _;
    }

    function initialize(
        IDepositManager _depositManager,
        IUnlockSchedule _schedule,
        bytes calldata _data,
        uint _lockedAmount
        ) 
        public 
        initializer 
        {
            __BaseGovernanceWithUser_init(_msgSender());
            __ERC721_init_unchained(NAME, SYMBOL);
            __Lock_init(_depositManager, _schedule);
            __init_beneficiaries( _data, _lockedAmount);
    }

    function __Lock_init( 
        IDepositManager _depositManager,
        IUnlockSchedule _schedule
        ) 
        internal 
        onlyInitializing 
        {
            schedule = _schedule;
            depositManager = _depositManager;
            splitManager = ISplitManager(address(0));
            tokenERC20 = IERC20Upgradeable(address(0));

            lockStartTime = schedule.lockStart();
            _setupRole(BENEFICIARY_MANAGER_ROLE, _msgSender());
            _setupRole(DEPOSIT_MANAGER_ROLE, address(_depositManager));
    }

    function __init_beneficiaries(bytes calldata _data, uint _lockedAmount) internal onlyInitializing {
        depositManager.addDeposits(_data, _lockedAmount);
        canAddBeneficiaries = true;
        canRemoveBeneficiaries = true;
        canTransfer = true;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Upgradeable, AccessControlUpgradeable)
        returns (bool)
     {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @notice Get all the information about a NFT with specific ID
     * @param id NFT ID of the NFT for which the information is required
     * @return Owner or beneficiary of the NFT
     * @return The actual balance of amount locked
     * @return The actual amount that the owner can claim
     * @return The time when the lock start
     * @return The time when the lock will end
     */
    function getInfoByID(uint id) view external returns(address, uint, uint, uint, uint){
        address owner = ownerOf(id);
        (, uint startLock, uint initAmount, uint claimed) = depositManager.getProperties(id);
        uint endLock = startLock + 10 days; // Just for test
        uint lockedAmount = initAmount - claimed;
        return (owner, lockedAmount, lockedAmount, startLock, endLock);
    }

    /**
     * @notice Get all the information about a set of IDs
     * @param ids List of NFT IDs which the information is required
     * @return List of owners or beneficiaries
     * @return List of actual balance of amount locked
     * @return List of actual amount that is claimable
     */
    function getInfoByManyIDs(uint[] memory ids) view external returns(address[] memory, uint[] memory, uint[] memory) {
        uint length = ids.length;
        address[] memory owners = new address[](length);
        uint[] memory lockedAmount = new uint[](length);
        uint[] memory claimable = new uint[](length);
        for(uint256 i; i < length; i++) {
            (, , uint initAmount, uint claimed) = depositManager.getProperties(ids[i]);
            owners[i] = ownerOf(ids[i]);
            lockedAmount[i] = initAmount - claimed;
            claimable[i] = schedule.unlockedAmount(initAmount) - claimed;
            if (claimable[i] > lockedAmount[i]) {
                claimable[i] =lockedAmount[i];
            }
        }
        return (owners, lockedAmount, claimable);
    }

    /**
     * @notice Add beneficiaries to the Lock
     * @param data ABI-encoded data of beneficiaries (arrays of addresses and amounts, etc - specific to IDepositManager)
     * @param totalAmount Total amount of tokens to be locked for additional beneficiaries
     */
    function addBeneficiaries(bytes calldata data, uint256 totalAmount) external onlyBeneficiaryManager {
        require(canAddBeneficiaries, "ERROR: Cannot add new beneficiaries");
        depositManager.addDeposits(data, totalAmount);
    }

    /**
     * @notice Remove beneficiaries to the Lock
     * @param data ABI-encoded data of beneficiaries (arrays of addresses and amounts, etc - specific to IDepositManager)
     */
    function removeBeneficiaries(bytes calldata data) external onlyBeneficiaryManager {
        require(canRemoveBeneficiaries, "ERROR: Cannot remove beneficiaries");
        uint[] memory IDs = abi.decode(data, (uint[]));
        for(uint256 i; i < IDs.length; i++){
            depositManager.removeDeposits(IDs[i]);
        }
    }

    /**
     * @notice Claim and mint a NFT from the MerkleTree
     * @param ownershipProof ABI-encoded data to verify in MerkleTree (specific to DepositManager with Merkle Tree)
     * @return The Minted NFT Id
     */
    function claimNFT(bytes calldata ownershipProof) external returns(uint) {
        (bool _success, uint256 _ID) = depositManager.verifyOwnership(_msgSender(), ownershipProof);
        require(_success, "ERROR: You are not the owner or are approved for this NFT");
        return _ID;
    }
    
    /**
     * @notice Claim unlocked tokens from the specified NFT
     * @param nftId NFT-ID
     * @param amountToClaim Amount to be claimed
     */
    function claimUnlocked(uint256 nftId, uint256 amountToClaim) external {
        bool _success = _isApprovedOrOwner(_msgSender(), nftId);
        require(_success, "ERROR: You are not the owner or are approved for this NFT");
        depositManager.updateClaimedAmount(nftId, amountToClaim);
    }

    /**
     * @notice Split a NFT
     * @param originId ID-NFT to be divided
     * @param splitParts Split proportions normalized
     * @param addresses Addresses of beneficiaries
     */
    function split(uint originId, uint[] memory splitParts, address[] memory addresses) external {
        bool _success = _isApprovedOrOwner(_msgSender(), originId);
        require(_success, "ERROR: You are not the owner or are approved for this NFT");
        uint256 lockedPart;
        depositManager.split(originId, lockedPart, splitParts, addresses);
    }

    /**
     * @notice Deposit Manager call and mint an amount (count) of NFTs with addresses owners
     * @dev This function can be called only for DepositManager address
     * @param count Amount of NFTs to be minted
     * @param addresses Array of addresses to be Owners of the new NFTs
     * @return Array list with the IDs of the new NFTs
     */
    function mintNFTs(uint256 count, address[] memory addresses) external onlyDepositManager returns(uint256[] memory) {
        uint[] memory IDs = new uint[](count);
        for(uint256 i; i < count; i++) {
            _safeMint(addresses[i], totalIDs + i);
            IDs[i] = totalIDs + i;
        }
        totalIDs += count;
        return IDs;
    }
    
    /**
     * @notice Deposit Manager call and burn a single/set of NFT IDs
     * @dev This function can be called only for DepositManager address
     * @param id NFT ID to be burned
     */
    function burnNFT(uint id) external onlyDepositManager {
        _burn(id);
    }

    function _isApprovedOrOwner(uint256 _nftId, address _beneficiary, bytes calldata _data) internal returns(bool, uint) {
        if(_data.length == 0) {
            if(_isApprovedOrOwner(_beneficiary, _nftId)) {
                return (true, _nftId);
            } 
            return (false, _nftId);
        } else {
            (bool _success, uint256 _ID) = depositManager.verifyOwnership(_beneficiary, _data);
            if(_success && _ID == _nftId){
                return (true, _nftId);
            }else{
                return (false, _nftId);

            }
        }
    }

    function _setNFTs(address[] memory _addresses, uint _numIDs) internal returns(uint[] memory){
        uint[] memory IDs = new uint[](_numIDs);
        for(uint256 i; i < _numIDs; i++) {
            _safeMint(_addresses[0], totalIDs + i);
            IDs[i] = totalIDs + i;
        }
        totalIDs += _numIDs;
        return IDs;
    }

    function  _beforeTokenTransfer(address from, address to, uint256 tokenId) internal override {
        if (from != address(0)) {
            require(canTransfer, "ERROR: The lock policy do not allow transfers.");
            depositManager.transfer(to,tokenId);
        }
    }
}