// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ProductRegistry {
    enum Status {
        NONE,
        ACTIVE,
        FLAGGED
    }

    struct Product {
        string productId;
        address manufacturer;
        string productHash;
        uint256 timestamp;
        Status status;
    }

    mapping(string => Product) private products;
    mapping(address => bool) public approvedManufacturers;
    address public admin;

    event ManufacturerApproved(address indexed manufacturer);
    event ManufacturerRevoked(address indexed manufacturer);
    event ProductRegistered(
        string indexed productId,
        address indexed manufacturer,
        string productHash,
        uint256 timestamp
    );
    event ProductFlagged(string indexed productId);

    modifier onlyAdmin() {
        require(msg.sender == admin, "ProductRegistry: caller is not admin");
        _;
    }

    modifier onlyApprovedManufacturer() {
        require(
            approvedManufacturers[msg.sender],
            "ProductRegistry: manufacturer not approved"
        );
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function approveManufacturer(address manufacturer) external onlyAdmin {
        require(manufacturer != address(0), "ProductRegistry: zero address");
        approvedManufacturers[manufacturer] = true;
        emit ManufacturerApproved(manufacturer);
    }

    function revokeManufacturer(address manufacturer) external onlyAdmin {
        approvedManufacturers[manufacturer] = false;
        emit ManufacturerRevoked(manufacturer);
    }

    function flagProduct(string calldata productId) external onlyAdmin {
        require(
            products[productId].status != Status.NONE,
            "ProductRegistry: product does not exist"
        );
        products[productId].status = Status.FLAGGED;
        emit ProductFlagged(productId);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "ProductRegistry: zero address");
        admin = newAdmin;
    }

    function registerProduct(
        string calldata productId,
        string calldata productHash
    ) external onlyApprovedManufacturer {
        require(bytes(productId).length > 0, "ProductRegistry: empty productId");
        require(
            products[productId].status == Status.NONE,
            "ProductRegistry: product already registered"
        );

        products[productId] = Product({
            productId: productId,
            manufacturer: msg.sender,
            productHash: productHash,
            timestamp: block.timestamp,
            status: Status.ACTIVE
        });

        emit ProductRegistered(productId, msg.sender, productHash, block.timestamp);
    }

    function getProduct(string calldata productId)
        external
        view
        returns (
            string memory,
            address,
            string memory,
            uint256,
            Status
        )
    {
        Product memory p = products[productId];
        require(p.status != Status.NONE, "ProductRegistry: product does not exist");
        return (p.productId, p.manufacturer, p.productHash, p.timestamp, p.status);
    }

    function verifyProduct(string calldata productId, string calldata productHash)
        external
        view
        returns (bool exists, bool hashMatches, bool isFlagged)
    {
        Product memory p = products[productId];
        exists = p.status != Status.NONE;
        hashMatches = exists && keccak256(bytes(p.productHash)) == keccak256(bytes(productHash));
        isFlagged = p.status == Status.FLAGGED;
    }
}
