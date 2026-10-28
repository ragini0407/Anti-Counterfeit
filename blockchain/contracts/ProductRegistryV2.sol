// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title ProductRegistryV2
/// @notice New registry for explicit, auditable supply-chain custody steps.
/// @dev Deploy separately. ProductRegistry (V1) and its records are untouched.
contract ProductRegistryV2 {
    enum Role {
        NONE,
        MANUFACTURER,
        DISTRIBUTOR,
        RETAILER
    }

    enum ProductState {
        MINTED,
        DISPATCHED_TO_DISTRIBUTOR,
        RECEIVED_BY_DISTRIBUTOR,
        DISPATCHED_TO_RETAILER,
        RECEIVED_BY_RETAILER,
        SOLD,
        FLAGGED_COUNTERFEIT
    }

    struct RoleRequest {
        Role requestedRole;
        string companyName;
        bool approved;
        bool exists;
    }

    struct Product {
        string productId;
        string manufacturerId;
        string productHash;
        string ipfsImageHash;
        uint256 mintedAt;
        ProductState state;
        address manufacturer;
        address currentCustodian;
        address authorizedDistributor;
        address authorizedRetailer;
        bool exists;
    }

    address public immutable admin;
    mapping(address => Role) private roles;
    mapping(address => string) public companyNames;
    mapping(address => RoleRequest) public roleRequests;
    mapping(string => Product) private products;

    event RoleRequested(address indexed requester, Role requestedRole, string companyName);
    event RoleApproved(address indexed account, Role role);
    event RoleRevoked(address indexed account);
    event ProductMinted(
        string indexed productId,
        string manufacturerId,
        string productHash,
        string ipfsImageHash,
        uint256 timestamp
    );
    event CustodyAssigned(
        string indexed productId,
        address distributor,
        address retailer,
        uint256 timestamp
    );
    event ProductLifecycleEvent(
        string indexed productId,
        address indexed actor,
        address indexed counterparty,
        ProductState previousState,
        ProductState newState,
        address custodian,
        uint256 timestamp
    );
    event ProductFlagged(string indexed productId, string reason, uint256 timestamp);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier productExists(string memory productId) {
        require(products[productId].exists, "Product not found");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    /// @notice Account requests its own role; only admin can approve it.
    function requestRole(Role requestedRole, string calldata companyName) external {
        require(requestedRole != Role.NONE, "Invalid role");
        require(roles[msg.sender] == Role.NONE, "Already has a role");
        roleRequests[msg.sender] = RoleRequest({
            requestedRole: requestedRole,
            companyName: companyName,
            approved: false,
            exists: true
        });
        emit RoleRequested(msg.sender, requestedRole, companyName);
    }

    function approveRole(address account) external onlyAdmin {
        RoleRequest storage request = roleRequests[account];
        require(account != address(0) && request.exists, "No request found");
        require(!request.approved && roles[account] == Role.NONE, "Already approved");
        roles[account] = request.requestedRole;
        companyNames[account] = request.companyName;
        request.approved = true;
        emit RoleApproved(account, request.requestedRole);
    }

    function revokeRole(address account) external onlyAdmin {
        require(account != address(0) && roles[account] != Role.NONE, "No role to revoke");
        roles[account] = Role.NONE;
        emit RoleRevoked(account);
    }

    function getRole(address account) external view returns (Role) {
        return roles[account];
    }

    function mintProduct(
        string calldata productId,
        string calldata manufacturerId,
        string calldata productHash,
        string calldata ipfsImageHash,
        address authorizedDistributor,
        address authorizedRetailer
    ) external {
        require(roles[msg.sender] == Role.MANUFACTURER, "Only manufacturer");
        require(bytes(productId).length > 0, "Product ID cannot be empty");
        require(bytes(manufacturerId).length > 0, "Manufacturer ID cannot be empty");
        require(bytes(productHash).length > 0, "Product hash cannot be empty");
        require(!products[productId].exists, "Product already minted");
        require(authorizedDistributor != address(0), "Distributor cannot be zero address");
        require(authorizedRetailer != address(0), "Retailer cannot be zero address");
        require(authorizedDistributor != authorizedRetailer, "Partners must be distinct");
        require(roles[authorizedDistributor] == Role.DISTRIBUTOR, "Invalid distributor address");
        require(roles[authorizedRetailer] == Role.RETAILER, "Invalid retailer address");

        products[productId] = Product({
            productId: productId,
            manufacturerId: manufacturerId,
            productHash: productHash,
            ipfsImageHash: ipfsImageHash,
            mintedAt: block.timestamp,
            state: ProductState.MINTED,
            manufacturer: msg.sender,
            currentCustodian: msg.sender,
            authorizedDistributor: authorizedDistributor,
            authorizedRetailer: authorizedRetailer,
            exists: true
        });

        emit ProductMinted(productId, manufacturerId, productHash, ipfsImageHash, block.timestamp);
        emit CustodyAssigned(productId, authorizedDistributor, authorizedRetailer, block.timestamp);
    }

    function dispatchToDistributor(string calldata productId)
        external
        productExists(productId)
    {
        Product storage product = products[productId];
        require(roles[msg.sender] == Role.MANUFACTURER, "Only manufacturer");
        require(msg.sender == product.manufacturer, "Not product manufacturer");
        require(product.currentCustodian == msg.sender, "Manufacturer is not current custodian");
        require(product.state == ProductState.MINTED, "Product must be MINTED");
        _transition(productId, product, ProductState.DISPATCHED_TO_DISTRIBUTOR,
            product.authorizedDistributor, product.currentCustodian);
    }

    function receiveByDistributor(string calldata productId)
        external
        productExists(productId)
    {
        Product storage product = products[productId];
        require(roles[msg.sender] == Role.DISTRIBUTOR, "Only distributor");
        require(msg.sender == product.authorizedDistributor, "Not authorized distributor");
        require(product.state == ProductState.DISPATCHED_TO_DISTRIBUTOR, "Product not dispatched to distributor");
        _transition(productId, product, ProductState.RECEIVED_BY_DISTRIBUTOR,
            product.manufacturer, msg.sender);
    }

    function dispatchToRetailer(string calldata productId)
        external
        productExists(productId)
    {
        Product storage product = products[productId];
        require(roles[msg.sender] == Role.DISTRIBUTOR, "Only distributor");
        require(msg.sender == product.authorizedDistributor, "Not authorized distributor");
        require(product.currentCustodian == msg.sender, "Distributor is not current custodian");
        require(product.state == ProductState.RECEIVED_BY_DISTRIBUTOR, "Distributor must receive product first");
        _transition(productId, product, ProductState.DISPATCHED_TO_RETAILER,
            product.authorizedRetailer, product.currentCustodian);
    }

    function receiveByRetailer(string calldata productId)
        external
        productExists(productId)
    {
        Product storage product = products[productId];
        require(roles[msg.sender] == Role.RETAILER, "Only retailer");
        require(msg.sender == product.authorizedRetailer, "Not authorized retailer");
        require(product.state == ProductState.DISPATCHED_TO_RETAILER, "Product not dispatched to retailer");
        _transition(productId, product, ProductState.RECEIVED_BY_RETAILER,
            product.authorizedDistributor, msg.sender);
    }

    /// @notice Retailer attests a sale; QR scans never invoke this state change.
    function recordSale(string calldata productId) external productExists(productId) {
        Product storage product = products[productId];
        require(roles[msg.sender] == Role.RETAILER, "Only retailer");
        require(msg.sender == product.authorizedRetailer, "Not authorized retailer");
        require(product.currentCustodian == msg.sender, "Retailer is not current custodian");
        require(product.state == ProductState.RECEIVED_BY_RETAILER, "Retailer must receive product first");
        _transition(productId, product, ProductState.SOLD, address(0), msg.sender);
    }

    function flagCounterfeit(string calldata productId, string calldata reason)
        external
        onlyAdmin
        productExists(productId)
    {
        Product storage product = products[productId];
        require(product.state != ProductState.FLAGGED_COUNTERFEIT, "Already flagged");
        ProductState previousState = product.state;
        product.state = ProductState.FLAGGED_COUNTERFEIT;
        emit ProductLifecycleEvent(productId, msg.sender, address(0), previousState,
            ProductState.FLAGGED_COUNTERFEIT, product.currentCustodian, block.timestamp);
        emit ProductFlagged(productId, reason, block.timestamp);
    }

    function _transition(
        string calldata productId,
        Product storage product,
        ProductState nextState,
        address counterparty,
        address nextCustodian
    ) private {
        ProductState previousState = product.state;
        product.state = nextState;
        product.currentCustodian = nextCustodian;
        emit ProductLifecycleEvent(productId, msg.sender, counterparty, previousState,
            nextState, nextCustodian, block.timestamp);
    }

    function getProduct(string calldata productId)
        external
        view
        productExists(productId)
        returns (
            string memory storedProductId,
            string memory manufacturerId,
            string memory productHash,
            string memory ipfsImageHash,
            uint256 mintedAt,
            ProductState state,
            address manufacturer,
            address currentCustodian,
            address authorizedDistributor,
            address authorizedRetailer
        )
    {
        Product storage product = products[productId];
        return (product.productId, product.manufacturerId, product.productHash,
            product.ipfsImageHash, product.mintedAt, product.state,
            product.manufacturer, product.currentCustodian,
            product.authorizedDistributor, product.authorizedRetailer);
    }

    function getProductState(string calldata productId)
        external
        view
        productExists(productId)
        returns (ProductState)
    {
        return products[productId].state;
    }

    function isProductFlagged(string calldata productId)
        external
        view
        productExists(productId)
        returns (bool)
    {
        return products[productId].state == ProductState.FLAGGED_COUNTERFEIT;
    }

    /// @notice Read-only authenticity check. It never changes lifecycle state.
    function verifyProduct(string calldata productId, string calldata hashToCheck)
        external
        view
        productExists(productId)
        returns (bool genuine, bool flagged, ProductState currentState)
    {
        Product storage product = products[productId];
        bool hashMatches = keccak256(bytes(product.productHash)) == keccak256(bytes(hashToCheck));
        bool isFlagged = product.state == ProductState.FLAGGED_COUNTERFEIT;
        return (hashMatches && !isFlagged, isFlagged, product.state);
    }
}
