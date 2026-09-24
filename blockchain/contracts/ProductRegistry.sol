// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ProductRegistry {
    enum Status {
        NONE,
        ACTIVE,
        FLAGGED,
        DEACTIVATED
    }

    struct Product {
        string productId;
        string productName;
        string category;
        string brandName;
        string batchNumber;
        string manufacturingDate;
        address manufacturer;
        string productHash;
        string imageHash;
        string qrHash;
        uint256 timestamp;
        Status status;
    }

    mapping(string => Product) private products;
    mapping(address => bool) public approvedManufacturers;
    mapping(address => string[]) private manufacturerProducts;

    address public admin;

    event ManufacturerApproved(address indexed manufacturer);
    event ManufacturerRevoked(address indexed manufacturer);

    event ProductRegistered(
        string indexed productId,
        address indexed manufacturer,
        string productHash,
        string imageHash,
        string qrHash,
        uint256 timestamp
    );

    event ProductFlagged(string indexed productId);
    event ProductDeactivated(string indexed productId);

    modifier onlyAdmin() {
        require(
            msg.sender == admin,
            "ProductRegistry: caller is not admin"
        );
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

    function approveManufacturer(address manufacturer)
        external
        onlyAdmin
    {
        require(
            manufacturer != address(0),
            "ProductRegistry: zero address"
        );

        approvedManufacturers[manufacturer] = true;

        emit ManufacturerApproved(manufacturer);
    }

    function revokeManufacturer(address manufacturer)
        external
        onlyAdmin
    {
        approvedManufacturers[manufacturer] = false;

        emit ManufacturerRevoked(manufacturer);
    }

    function registerProduct(
        string calldata productId,
        string calldata productName,
        string calldata category,
        string calldata brandName,
        string calldata batchNumber,
        string calldata manufacturingDate,
        string calldata productHash,
        string calldata imageHash,
        string calldata qrHash
    )
        external
        onlyApprovedManufacturer
    {
        require(
            bytes(productId).length > 0,
            "ProductRegistry: empty productId"
        );

        require(
            products[productId].status == Status.NONE,
            "ProductRegistry: product already registered"
        );

        products[productId] = Product({
            productId: productId,
            productName: productName,
            category: category,
            brandName: brandName,
            batchNumber: batchNumber,
            manufacturingDate: manufacturingDate,
            manufacturer: msg.sender,
            productHash: productHash,
            imageHash: imageHash,
            qrHash: qrHash,
            timestamp: block.timestamp,
            status: Status.ACTIVE
        });

        manufacturerProducts[msg.sender].push(productId);

        emit ProductRegistered(
            productId,
            msg.sender,
            productHash,
            imageHash,
            qrHash,
            block.timestamp
        );
    }

    function getProduct(string calldata productId)
        external
        view
        returns (Product memory)
    {
        Product memory p = products[productId];

        require(
            p.status != Status.NONE,
            "ProductRegistry: product does not exist"
        );

        return p;
    }

    function getManufacturerProducts(address manufacturer)
        external
        view
        returns (string[] memory)
    {
        return manufacturerProducts[manufacturer];
    }

    function verifyProduct(string calldata productId)
        external
        view
        returns (
            bool exists,
            bool isActive,
            bool isFlagged,
            string memory imageHash,
            string memory qrHash
        )
    {
        Product memory p = products[productId];

        exists = p.status != Status.NONE;
        isActive = p.status == Status.ACTIVE;
        isFlagged = p.status == Status.FLAGGED;

        if (exists) {
            imageHash = p.imageHash;
            qrHash = p.qrHash;
        }
    }

    function deactivateProduct(string calldata productId)
        external
        onlyApprovedManufacturer
    {
        Product storage p = products[productId];

        require(
            p.status != Status.NONE,
            "ProductRegistry: product does not exist"
        );

        require(
            p.manufacturer == msg.sender,
            "ProductRegistry: not product owner"
        );

        require(
            p.status == Status.ACTIVE,
            "ProductRegistry: product not active"
        );

        p.status = Status.DEACTIVATED;

        emit ProductDeactivated(productId);
    }

    function flagProduct(string calldata productId)
        external
        onlyAdmin
    {
        require(
            products[productId].status != Status.NONE,
            "ProductRegistry: product does not exist"
        );

        products[productId].status = Status.FLAGGED;

        emit ProductFlagged(productId);
    }

    function transferAdmin(address newAdmin)
        external
        onlyAdmin
    {
        require(
            newAdmin != address(0),
            "ProductRegistry: zero address"
        );

        admin = newAdmin;
    }
}