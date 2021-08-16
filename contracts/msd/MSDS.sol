// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "../library/Initializable.sol";
import "../library/ReentrancyGuard.sol";
import "../library/Ownable.sol";
import "../library/ERC20.sol";
import "../library/SafeRatioMath.sol";
import "../interface/IInterestRateModelInterface.sol";

import "./MSDController.sol";
import "./MSD.sol";

/**
 * @title dForce's Multi-currency Stable Debt Saving Token
 * @author dForce
 */
contract MSDS is Initializable, ReentrancyGuard, Ownable, ERC20 {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeRatioMath for uint256;

    bytes32 public DOMAIN_SEPARATOR;
    // keccak256("Permit(address owner,address spender,uint256 chainId, uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 public constant PERMIT_TYPEHASH =
        0x576144ed657c8304561e56ca632e17751956250114636e8c01f64a7f2c6d98cf;
    mapping(address => uint256) public nonces;

    /**
     * @dev The underlying MSD.
     */
    address public underlying;

    /**
     * @dev Initial exchange rate(scaled by 1e18).
     */
    uint256 constant initialExchangeRate = 1e18;

    /**
     * @dev The exchange rate between MSDS and underlying MSD(scaled by 1e18).
     */
    uint256 internal exchangeRate;

    /**
     * @dev Current interest rate model contract.
     */
    IInterestRateModelInterface public interestRateModel;

    /**
     * @dev Block number that interest was last accrued at.
     */
    uint256 public accrualBlockNumber;

    /**
     * @dev MSD Controller to mint MSD token and to inform when accruing interest
     */
    MSDController public msdController;

    event NewInterestRateModel(
        IInterestRateModelInterface oldInterestRateModel,
        IInterestRateModelInterface newInterestRateModel
    );

    event NewMSDController(
        MSDController oldMSDController,
        MSDController newMSDController
    );

    /**
     * @notice Expects to call only once to initialize the MSD token.
     * @param _name Token name.
     * @param _symbol Token symbol.
     */
    function initialize(
        string memory _name,
        string memory _symbol,
        address _underlying,
        IInterestRateModelInterface _interestRateModel,
        MSDController _msdController
    ) external initializer {
        require(
            address(_msdController) != address(0),
            "initialize: MSD controller address should not be zero address!"
        );
        require(
            address(_interestRateModel) != address(0),
            "initialize: interest model address should not be zero address!"
        );
        __Ownable_init();
        __ERC20_init(_name, _symbol, ERC20(_underlying).decimals());

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes(_name)),
                keccak256(bytes("1")),
                _getChainId(),
                address(this)
            )
        );

        underlying = _underlying;
        exchangeRate = initialExchangeRate;

        interestRateModel = _interestRateModel;

        msdController = _msdController;
    }

    /**
     * @dev Sets a new interest rate model.
     * @param _newInterestRateModel The new interest rate model.
     */
    function _setInterestRateModel(
        IInterestRateModelInterface _newInterestRateModel
    ) external onlyOwner {
        // Gets current interest rate model.
        IInterestRateModelInterface _oldInterestRateModel = interestRateModel;

        // Ensures the input address is the interest model contract.
        require(
            _newInterestRateModel.isInterestRateModel(),
            "_setInterestRateModel: This is not the rate model contract!"
        );

        // Set to the new interest rate model.
        interestRateModel = _newInterestRateModel;

        emit NewInterestRateModel(_oldInterestRateModel, _newInterestRateModel);
    }

    /**
     * @dev Sets a new MSD controller.
     * @param _newMSDController The new MSD controller
     */
    function _setMSDController(MSDController _newMSDController)
        external
        onlyOwner
    {
        MSDController _oldMSDController = msdController;

        // Ensures the input address is a MSDController contract.
        require(
            _newMSDController.isMSDController(),
            "_setMSDController: This is not MSD controller contract!"
        );

        msdController = _newMSDController;

        emit NewMSDController(_oldMSDController, _newMSDController);
    }

    function _updateInterest() internal {
        // When more calls in the same block, only the first one takes effect, so for the
        // following calls, nothing updates.
        if (block.number != accrualBlockNumber) {
            // Start accumulating interest after first mint
            if (totalSupply != 0) {
                // Calculates the number of blocks elapsed since the last accrual.
                uint256 _blockDelta = block.number.sub(accrualBlockNumber);

                // Gets the current supply interest rate.
                uint256 _interestRate =
                    interestRateModel.getSupplyRate(0, 0, 0, 0);

                /*
                 * Calculates the interest accumulated and the new exchange rate:
                 *  simpleInterestFactor = interestRate * blockDelta
                 *  exchangeRate = exchangeRate + simpleInterestFactor * exchangeRate
                 */
                uint256 _simpleInterestFactor = _interestRate.mul(_blockDelta);
                uint256 _exchangeRateInc =
                    exchangeRate.rmul(_simpleInterestFactor);

                uint256 _interestAccured = totalSupply.rmul(_exchangeRateInc);

                // Notify the MSD controller to update debt
                if (_interestAccured > 0) {
                    msdController.addDebt(underlying, _interestAccured);
                }

                exchangeRate = exchangeRate.add(_exchangeRateInc);

                // Emits an `UpdateInterest` event.
                // emit UpdateInterest(block.number, exchangeRate);
            }

            accrualBlockNumber = block.number;
        }
    }

    /**
     * @dev Calculates interest and update exchange rate.
     */
    modifier settleInterest() {
        _updateInterest();
        _;
    }

    /**
     * @notice Supposed to transfer underlying token into this contract
     * @dev MSDS burns the amount of underlying rather than transfering.
     */
    function _doTransferIn(address _sender, uint256 _amount)
        internal
        returns (uint256)
    {
        MSD(underlying).burn(_sender, _amount);
        return _amount;
    }

    /**
     * @notice Supposed to transfer underlying token to `_recipient`
     * @dev MSDS mint the amount of underlying rather than transfering.
     * this can be called by `borrow()` and `_withdrawReserves()`
     */
    function _doTransferOut(address payable _recipient, uint256 _amount)
        internal
    {
        msdController.mintMSD(underlying, _recipient, _amount);
    }

    /**
     * @notice Mint MSDS `amount` underlying MSD token into `account`.
     * @param _account the address to mint MSDS to.
     * @param _amount The amount of underlying MSD to mint.
     */
    function mint(address _account, uint256 _amount)
        external
        nonReentrant
        settleInterest
    {
        uint256 _amountIn = _doTransferIn(msg.sender, _amount);

        _mint(_account, _amountIn.rdiv(exchangeRate));
    }

    /**
     * @notice Redeem MSDS `amount` MSDS token from `account` and return corresponding underlying MSD.
     * @param _account the address to redeem MSDS from.
     * @param _amount The amount of MSDS to redeem.
     */
    function redeem(address _account, uint256 _amount)
        external
        nonReentrant
        settleInterest
    {
        _burnFrom(_account, _amount);

        _doTransferOut(msg.sender, _amount.rmul(exchangeRate));
    }

    /**
     * @notice Redeem  `amount` of underlying MSD token from `account`.
     * @param _account the address to redeem MSDS from.
     * @param _underlyingAmount The amount of underlying MSD to redeem.
     */
    function redeemUnderlying(address _account, uint256 _underlyingAmount)
        external
        nonReentrant
        settleInterest
    {
        _burnFrom(_account, _underlyingAmount.rdivup(exchangeRate));

        _doTransferOut(msg.sender, _underlyingAmount);
    }

    /**
     * @notice Calculates interest and update exchange rate.
     * @dev Updates exchange rate with any accumulated interest.
     */
    function updateInterest() external returns (bool) {
        _updateInterest();
        return true;
    }

    /**
     * @dev Gets the underlying balance of user without accruing interest.
     */
    function balanceOfUnderlyingStored(address _account)
        external
        view
        returns (uint256)
    {
        return balanceOf[_account].mul(exchangeRate);
    }

    /**
     * @dev Gets the borrow balance of user with the latest `exchangeRate`.
     */
    function balanceOfUnderlyingCurrent(address _account)
        external
        returns (uint256)
    {
        return balanceOf[_account].mul(exchangeRateCurrent());
    }

    /**
     * @dev Gets the newest exchange rate by accruing interest.
     */
    function exchangeRateCurrent() public settleInterest returns (uint256) {
        return exchangeRate;
    }

    /**
     * @dev Gets the newest exchange rate without accruing interest.
     */
    function exchangeRateStored() external view returns (uint256) {
        return exchangeRate;
    }

    /**
     * @dev Returns the current per-block saving interest rate.
     */
    function supplyRatePerBlock() public view returns (uint256) {
        return interestRateModel.getSupplyRate(0, 0, 0, 0);
    }

    function _getChainId() internal pure returns (uint256) {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        return chainId;
    }

    /**
     * @dev EIP2612 permit function. For more details, please look at here:
     * https://eips.ethereum.org/EIPS/eip-2612
     * @param _owner The owner of the funds.
     * @param _spender The spender.
     * @param _value The amount.
     * @param _deadline The deadline timestamp, type(uint256).max for max deadline.
     * @param _v Signature param.
     * @param _s Signature param.
     * @param _r Signature param.
     */
    function permit(
        address _owner,
        address _spender,
        uint256 _value,
        uint256 _deadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external {
        require(_deadline >= block.timestamp, "permit: EXPIRED!");
        uint256 _currentNonce = nonces[_owner];
        bytes32 _digest =
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    DOMAIN_SEPARATOR,
                    keccak256(
                        abi.encode(
                            PERMIT_TYPEHASH,
                            _owner,
                            _spender,
                            _getChainId(),
                            _value,
                            _currentNonce,
                            _deadline
                        )
                    )
                )
            );
        address _recoveredAddress = ecrecover(_digest, _v, _r, _s);
        require(
            _recoveredAddress != address(0) && _recoveredAddress == _owner,
            "permit: INVALID_SIGNATURE!"
        );
        nonces[_owner] = _currentNonce.add(1);
        _approve(_owner, _spender, _value);
    }
}
