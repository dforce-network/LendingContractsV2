//SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "../library/ERC20.sol";

contract Token is ERC20 {
    using AddressUpgradeable for address payable;

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _actualDecimals
    ) public {
        __ERC20_init(_name, _symbol, _actualDecimals);
    }

    function mint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) public {
        _burn(account, amount);
    }

    /**
     * @notice Only for test, do not use in a production env.
     */
    receive() external payable {}

    /**
     * @notice Only for test, do not use in a production env.
     */
    function transferEthOut(address payable to, uint256 amount)
        external
        payable
    {
        to.sendValue(amount);
    }
}
