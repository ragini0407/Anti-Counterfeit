import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import { Html5Qrcode } from "html5-qrcode";
import WalletBinding from "./WalletBinding";
import { apiUrl } from "./api";
import LifecycleWorkflow from "./LifecycleWorkflow";

import "./ManufacturerDashboard.css";

function ManufacturerDashboard({ onLogout }) {

  // =====================================================
  // MAIN STATE
  // =====================================================

  const [activePage, setActivePage] =
    useState("dashboard");

  // =====================================================
  // PRODUCTS
  // =====================================================

  const [products, setProducts] = useState([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const sumProductMetric = (field) => {
    if (!productsLoaded) return null;
    if (products.length === 0) return 0;
    if (products.some((product) => !Number.isFinite(product[field]))) return null;
    return products.reduce((sum, product) => sum + product[field], 0);
  };
  const displayMetric = (value) => Number.isFinite(value) ? value.toLocaleString() : "—";
  const [distributors, setDistributors] = useState([]);
  const [retailers, setRetailers] = useState([]);
  const [partnerLoadErrors, setPartnerLoadErrors] = useState({});
  const [selectedDistributor, setSelectedDistributor] = useState("");
  const [selectedRetailer, setSelectedRetailer] = useState("");
  const [pendingRegistration, setPendingRegistration] = useState(null);
  const [pendingTransactionHash, setPendingTransactionHash] = useState("");
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const rememberPendingRegistration = (pending) => {
    setPendingRegistration(pending);
    let user = {};
    try {
      user = JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      user = {};
    }
    if (!user.id) return;
    const storageKey = `pendingProductRegistration:${user.id}`;
    if (pending) {
      sessionStorage.setItem(storageKey, JSON.stringify({
        registrationId: pending.registrationId,
        transactionHash: pending.transactionHash || null
      }));
    } else {
      sessionStorage.removeItem(storageKey);
      setPendingTransactionHash("");
    }
  };
  const [loadingProducts, setLoadingProducts] = useState(true); 
  const fetchMyProducts = async () => {
  try {
    setLoadingProducts(true);

    const token = localStorage.getItem("token");

    if (!token) {
      alert("Login session expired. Please login again.");
      return;
    }

    const response = await fetch(
      apiUrl("/products/my-products"),
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || "Failed to fetch products"
      );
    }

    setProducts(data.products || []);
    setProductsLoaded(true);
  } catch (error) {
    console.error("Fetch products error:", error);
    alert(error.message);
  } finally {
    setLoadingProducts(false);
  }
};
useEffect(() => {
  fetchMyProducts();
}, []);

const fetchPendingRegistrations = async () => {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const response = await fetch(apiUrl("/products/registrations/pending"), {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Could not load pending registrations");

    const registrations = data.registrations || [];
    if (!registrations.length) {
      setPendingRegistration(null);
      return;
    }

    const cachedRaw = user.id
      ? sessionStorage.getItem(`pendingProductRegistration:${user.id}`)
      : null;
    let cached = null;
    try {
      cached = JSON.parse(cachedRaw || "null");
    } catch {
      cached = null;
    }
    const priority = { MINT_CONFIRMED: 0, MINT_SUBMITTING: 1, PREPARED: 2 };
    const selected = registrations.find((item) => item.registrationId === cached?.registrationId) ||
      [...registrations].sort((left, right) => priority[left.status] - priority[right.status])[0];
    const recovered = cached?.registrationId === selected.registrationId && cached.transactionHash
      ? { ...selected, transactionHash: cached.transactionHash, status: "MINT_CONFIRMED" }
      : selected;
    setPendingRegistration(recovered);
  } catch (error) {
    console.error("Pending registration lookup failed:", error.message);
  }
};

useEffect(() => {
  fetchPendingRegistrations();
}, []);

useEffect(() => {
  const loadPartners = async (type, setPartners) => {
    try {
      const response = await fetch(
        apiUrl(`/products/partners?type=${type}`),
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load partners");
      setPartners(data.partners || []);
      setPartnerLoadErrors((current) => ({ ...current, [type]: "" }));
    } catch (error) {
      console.error(`Could not load ${type.toLowerCase()}s:`, error.message);
      setPartnerLoadErrors((current) => ({ ...current, [type]: error.message || "ProductRegistry V2 partner data is unavailable." }));
    }
  };

  loadPartners("DISTRIBUTOR", setDistributors);
  loadPartners("RETAILER", setRetailers);
}, []);

  // =====================================================
  // PROFILE
  // =====================================================

  const [profile, setProfile] = useState(() => {
    try {
      const savedProfile =
        localStorage.getItem("manufacturerProfile");

      return savedProfile
        ? JSON.parse(savedProfile)
        : {
            name: "Manufacturer",
            company: "My Company",
            email: "manufacturer@example.com",
            phone: "",
            address: "",
          };
    } catch {
      return {
        name: "Manufacturer",
        company: "My Company",
        email: "manufacturer@example.com",
        phone: "",
        address: "",
      };
    }
  });

  const [showProfileEdit, setShowProfileEdit] =
    useState(false);

  const [profileForm, setProfileForm] =
    useState(profile);

  // =====================================================
  // REGISTER PRODUCT FORM
  // =====================================================

  const [productName, setProductName] =
    useState("");

  const [productCategory, setProductCategory] =
    useState("");

  const [productBrand, setProductBrand] =
    useState("");

  const [productPrice, setProductPrice] =
    useState("");

  const [productDescription, setProductDescription] =
    useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [manufacturingDate, setManufacturingDate] = useState("");
  const [referenceImage, setReferenceImage] = useState(null);
  // =====================================================
  // QR SCANNER
  // =====================================================

  const scannerRef = useRef(null);

  const [scannerOpen, setScannerOpen] =
    useState(false);

  const [scanResult, setScanResult] =
    useState(null);

  const [scannerError, setScannerError] =
    useState("");

  const [isStartingScanner, setIsStartingScanner] =
    useState(false);

  // =====================================================
  // SAVE PRODUCTS
  // =====================================================

  

  // =====================================================
  // SAVE PROFILE
  // =====================================================

  useEffect(() => {
    localStorage.setItem(
      "manufacturerProfile",
      JSON.stringify(profile)
    );
  }, [profile]);

  // =====================================================
  // CLEAN SCANNER WHEN COMPONENT CLOSES
  // =====================================================

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  // =====================================================
  // NAVIGATION
  // =====================================================

  const navigate = (page) => {
    stopScanner();

    setScanResult(null);
    setScannerError("");

    setActivePage(page);
  };

  // =====================================================
  // REGISTER PRODUCT
  // =====================================================

  const sendRegistrationForPersistence = async (pending, transactionHash) => {
    const response = await fetch(apiUrl("/products/confirm"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify({
        registrationId: pending.registrationId,
        transactionHash
      })
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.message || "Could not finalize the confirmed registration");
      error.retryable = Boolean(data.retryable);
      throw error;
    }

    rememberPendingRegistration(null);
    alert(`Product registered successfully.\nProduct ID: ${data.product.productCode}\nTransaction: ${data.blockchain.transactionHash}`);
    await fetchMyProducts();
    setProductName("");
    setProductCategory("");
    setProductBrand("");
    setProductPrice("");
    setProductDescription("");
    setBatchNumber("");
    setManufacturingDate("");
    setReferenceImage(null);
    setSelectedDistributor("");
    setSelectedRetailer("");
    navigate("products");
  };

  const assertMintWallet = async () => {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (!token) throw new Error("Login session expired. Please log in again.");
    if (!user.walletAddress) throw new Error("Bind your manufacturer wallet from the Profile page first.");
    if (!window.ethereum) throw new Error("MetaMask was not found in this browser.");

    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const address = accounts?.[0];
    if (!address || address.toLowerCase() !== user.walletAddress.toLowerCase()) {
      throw new Error("Select the wallet bound to this manufacturer account.");
    }
    const chainId = Number.parseInt(await window.ethereum.request({ method: "eth_chainId" }), 16);
    if (chainId !== 11155111) throw new Error("Switch MetaMask to Ethereum Sepolia.");
    return { address, token };
  };

  const submitPreparedRegistration = async (pending) => {
    const { address, token } = await assertMintWallet();
    const claimResponse = await fetch(
      apiUrl(`/products/registrations/${encodeURIComponent(pending.registrationId)}/claim-mint`),
      { method: "POST", headers: { Authorization: `Bearer ${token}` } }
    );
    const claimData = await claimResponse.json();
    if (!claimResponse.ok) throw new Error(claimData.message || "Registration is already being submitted.");

    const claimed = claimData.registration;
    rememberPendingRegistration(claimed);
    const transactionHash = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [{
        from: address,
        to: claimed.transaction.to,
        data: claimed.transaction.data,
        value: claimed.transaction.value
      }]
    });
    const confirmedPending = { ...claimed, status: "MINT_CONFIRMED", transactionHash };
    rememberPendingRegistration(confirmedPending);
    await sendRegistrationForPersistence(confirmedPending, transactionHash);
  };

  const registerProduct = async (e) => {
    e.preventDefault();
    if (registrationBusy) return;
    setRegistrationBusy(true);

    try {
      if (pendingRegistration) {
        if (!pendingRegistration.registrationId) {
          throw new Error("This browser-only pending mint has no durable server registration and cannot be safely retried.");
        }
        if (pendingRegistration.transactionHash || pendingRegistration.status === "MINT_CONFIRMED") {
          const existingHash = pendingRegistration.transactionHash || pendingTransactionHash;
          if (!existingHash) throw new Error("Enter the existing transaction hash; this retry will not send another mint.");
          const confirmedPending = { ...pendingRegistration, transactionHash: existingHash, status: "MINT_CONFIRMED" };
          rememberPendingRegistration(confirmedPending);
          await sendRegistrationForPersistence(confirmedPending, existingHash);
          return;
        }
        if (pendingRegistration.status === "MINT_SUBMITTING") {
          if (!pendingTransactionHash) {
            throw new Error("This registration is already reserved for a mint submission. Enter the existing MetaMask transaction hash; do not mint again.");
          }
          const confirmedPending = { ...pendingRegistration, transactionHash: pendingTransactionHash, status: "MINT_CONFIRMED" };
          rememberPendingRegistration(confirmedPending);
          await sendRegistrationForPersistence(confirmedPending, pendingTransactionHash);
          return;
        }
        await submitPreparedRegistration(pendingRegistration);
        return;
      }

      if (
        !productName.trim() || !productCategory || !productBrand.trim() ||
        !batchNumber || !manufacturingDate || !referenceImage ||
        !selectedDistributor || !selectedRetailer
      ) {
        throw new Error("Complete the product details, reference image, distributor, and retailer.");
      }

      await assertMintWallet();
      const product = {
        productName: productName.trim(),
        category: productCategory,
        brandName: productBrand.trim(),
        batchNumber: batchNumber.trim(),
        manufacturingDate,
        price: productPrice,
        description: productDescription
      };
      const formData = new FormData();
      Object.entries(product).forEach(([key, value]) => formData.append(key, value));
      formData.append("distributorId", selectedDistributor);
      formData.append("retailerId", selectedRetailer);
      formData.append("referenceImage", referenceImage);
      const idempotencyKey = crypto.randomUUID();
      const preparedResponse = await fetch(apiUrl("/products/prepare"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Idempotency-Key": idempotencyKey
        },
        body: formData
      });
      const prepared = await preparedResponse.json();
      if (!preparedResponse.ok) throw new Error(prepared.message || "Could not save a pending registration.");

      const pending = { ...prepared, idempotencyKey };
      rememberPendingRegistration(pending);
      await submitPreparedRegistration(pending);
    } catch (error) {
      console.error("Product registration error:", error.message);
      await fetchPendingRegistrations();
      alert(error.message);
    } finally {
      setRegistrationBusy(false);
    }
  };
  // =====================================================
  // DELETE PRODUCT
  // =====================================================

  const deleteProduct = async (productCode) => {
  const confirmed = window.confirm(
    "Are you sure you want to deactivate this product?"
  );

  if (!confirmed) return;

  try {
    const token = localStorage.getItem("token");

    if (!token) {
      alert("Login session expired. Please login again.");
      return;
    }

    const response = await fetch(
      apiUrl(`/products/${productCode}`),
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || "Product deactivation failed"
      );
    }

    alert(
      `Product ${productCode} deactivated successfully.`
    );

    // Reload products from blockchain
    await fetchMyProducts();

  } catch (error) {
    console.error(
      "Product deactivation error:",
      error
    );

    alert(error.message);
  }
};

  // =====================================================
  // GENERATE QR
  // =====================================================

  const generateQR = (product) => {
  const qrData = encodeURIComponent(
    JSON.stringify({
      productCode: product.productCode,
      productName: product.productName,
      brandName: product.brandName,
      category: product.category,
      productHash: product.productHash
    })
  );
    const qrURL =
      "https://api.qrserver.com/v1/create-qr-code/" +
      `?size=300x300&data=${qrData}`;

    window.open(
      qrURL,
      "_blank",
      "noopener,noreferrer"
    );
  };

  // =====================================================
  // START SCANNER
  // =====================================================

  const startScanner = async () => {

    if (isStartingScanner) return;

    setScannerError("");
    setScanResult(null);

    setIsStartingScanner(true);
    setScannerOpen(true);

    try {

      // Wait until scanner container is rendered
      await new Promise((resolve) =>
        setTimeout(resolve, 300)
      );

      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
          scannerRef.current.clear();
        } catch {
          // Already stopped
        }

        scannerRef.current = null;
      }

      const scanner =
        new Html5Qrcode("qr-reader");

      scannerRef.current = scanner;

      await scanner.start(

        {
          facingMode: "environment",
        },

        {
          fps: 10,

          qrbox: {
            width: 250,
            height: 250,
          },

          aspectRatio: 1,
        },

        async (decodedText) => {

          // ==========================================
          // QR FOUND
          // ==========================================

          let scannedData;

          try {
            scannedData =
              JSON.parse(decodedText);
          } catch {
            scannedData = {
              rawData: decodedText,
            };
          }

          // ==========================================
          // FIND PRODUCT
          // ==========================================
          const scannedProductCode =
          scannedData.productCode ||
          scannedData.productId;
          const matchingProduct =
            products.find(
              (product) =>
                product.productCode ===
                scannedData.productCode
            );

          if (matchingProduct) {
            setScanResult({
              found: true,

              product:
                matchingProduct,

              rawData: decodedText,
            });

          } else {

            setScanResult({
              found: false,

              rawData: decodedText,
            });
          }

          // Stop camera
          try {
            await scanner.stop();
            scanner.clear();
          } catch {
            // Ignore stop errors
          }

          scannerRef.current = null;

          setScannerOpen(false);
          setIsStartingScanner(false);
        },

        () => {
          // QR not detected yet
        }
      );

    } catch (error) {

      console.error(
        "Scanner error:",
        error
      );

      setScannerError(
        "Camera could not be opened. Please allow camera permission in Chrome and try again."
      );

      setScannerOpen(false);

      setIsStartingScanner(false);
    }
  };

  // =====================================================
  // STOP SCANNER
  // =====================================================

  const stopScanner = async () => {

    if (scannerRef.current) {

      try {

        await scannerRef.current.stop();

        scannerRef.current.clear();

      } catch {
        // Scanner already stopped
      }

      scannerRef.current = null;
    }

    setScannerOpen(false);
    setIsStartingScanner(false);
  };

  // =====================================================
  // PROFILE SAVE
  // =====================================================

  const saveProfile = (e) => {

    e.preventDefault();

    setProfile(profileForm);

    setShowProfileEdit(false);

    alert(
      "Profile updated successfully."
    );
  };

  // =====================================================
  // DASHBOARD PAGE
  // =====================================================

  const Dashboard = () => {

    const totalProducts = productsLoaded ? products.length : null;

    return (
      <>
        <PageHeader
          title="Manufacturer Dashboard"
          subtitle="Manage your products and monitor verification activity."
        />

        {/* STAT CARDS */}

        <div className="stats-grid">

          <StatCard
            icon="📦"
            title="Total Products"
            value={displayMetric(totalProducts)}
          />

          <StatCard
            icon="▦"
            title="Total Verifications"
            value={displayMetric(sumProductMetric("totalVerifications"))}
          />

          <StatCard
            icon="✓"
            title="QR Scans"
            value={displayMetric(sumProductMetric("qrScans"))}
          />

          <StatCard
            icon="▧"
            title="Image Verifications"
            value={displayMetric(sumProductMetric("imageVerifications"))}
          />

        </div>

        {/* DASHBOARD GRID */}

        <div className="dashboard-grid">

          {/* PRODUCT OVERVIEW */}

          <div className="content-card">

            <div className="card-title">

              <div>
                <h2>
                  Product Overview
                </h2>

                <p>
                  Your recently registered products.
                </p>
              </div>

              <button
                className="text-button"
                onClick={() =>
                  navigate("products")
                }
              >
                View All
              </button>

            </div>

            {products.length === 0 ? (

              <EmptyState
                icon="📦"
                title="No Products"
                text="Register your first product to get started."
                button="Register Product"
                onClick={() =>
                  navigate("register")
                }
              />

            ) : (

              <div className="mini-product-list">

                {products
                  .slice(0, 5)
                  .map((product) => (

                    <div
                      className="mini-product"
                      key={product.id}
                    >

                      <div className="product-icon">
                        📦
                      </div>

                      <div className="mini-product-info">

                        <strong>
                          {product.productName}
                        </strong>

                        <span>
                          {product.productCode}
                        </span>

                      </div>

                      <span className="status registered">
                        Registered
                      </span>

                    </div>

                  ))}

              </div>
            )}

          </div>

          {/* QUICK ACTIONS */}

          <div className="content-card">

            <div className="card-title">
              <h2>
                Quick Actions
              </h2>
            </div>

            <div className="quick-actions">

              <button
                onClick={() =>
                  navigate("register")
                }
              >
                <span>➕</span>
                Register Product
              </button>

              <button
                onClick={() =>
                  navigate("products")
                }
              >
                <span>📦</span>
                My Products
              </button>

              <button
                onClick={() =>
                  navigate("qr")
                }
              >
                <span>▦</span>
                Generate QR
              </button>

              <button
                onClick={() =>
                  navigate("qr")
                }
              >
                <span>📷</span>
                Scan QR
              </button>

              <button
                onClick={() =>
                  navigate("monitoring")
                }
              >
                <span>📊</span>
                Product Monitoring
              </button>

            </div>

          </div>

        </div>

        {/* RECENT PRODUCTS */}

        <div className="content-card">

          <div className="card-title">

            <div>
              <h2>
                Recent Products
              </h2>

              <p>
                Your latest registered products.
              </p>
            </div>

            <button
              className="text-button"
              onClick={() =>
                navigate("products")
              }
            >
              View All
            </button>

          </div>

          {products.length === 0 ? (

            <EmptyState
              icon="📦"
              title="No Products Registered"
              text="Register a product to see it here."
              button="Register Product"
              onClick={() =>
                navigate("register")
              }
            />

          ) : (

            <div className="table-container">

              <table>

                <thead>
                  <tr>
                    <th>
                      Product
                    </th>

                    <th>
                      Product ID
                    </th>

                    <th>
                      Category
                    </th>

                    <th>
                      Status
                    </th>
                  </tr>
                </thead>

                <tbody>

                  {products
                    .slice(0, 5)
                    .map((product) => (

                      <tr
                        key={product._id || product.productCode}
                      >

                        <td>
                          {product.productName}
                        </td>

                        <td>
                          {product.productCode}
                        </td>

                        <td>
                          {product.category}
                        </td>

                        <td>
                    <span className="status registered">Registered</span>
                        </td>

                      </tr>

                    ))}

                </tbody>

              </table>

            </div>

          )}

        </div>
      </>
    );
  };

  // =====================================================
  // MY PRODUCTS PAGE
  // =====================================================

  const ProductsPage = () => (
  <>
    <PageHeader
      title="My Products"
      subtitle="View and manage your registered products."
    />

    <div className="content-card">

      <div className="card-title">

        <div>
          <h2>Registered Products</h2>

          <p>
            All products registered by you.
          </p>
        </div>

        <button
          className="primary-button"
          onClick={() => navigate("register")}
        >
          + Register Product
        </button>

      </div>

      {loadingProducts ? (

        <div className="empty-state">
          <h3>Loading Products...</h3>
          <p>Fetching your products from the database.</p>
        </div>

      ) : products.length === 0 ? (

        <EmptyState
          icon="📦"
          title="No Products Available"
          text="Register your first product."
          button="Register Product"
          onClick={() => navigate("register")}
        />

      ) : (

        <div className="table-container">

          <table>

            <thead>

              <tr>
                <th>Product ID</th>
                <th>Product</th>
                <th>Category</th>
                <th>Brand</th>
                <th>Registration</th>
                <th>Verifications</th>
                <th>QR Scans</th>
                <th>Image Checks</th>
                <th>Actions</th>
              </tr>

            </thead>

            <tbody>

              {products.map((product) => (

                <tr
                  key={product._id}
                >

                  <td>
                    <strong>
                      {product.productCode}
                    </strong>
                  </td>

                  <td>
                    {product.productName}
                  </td>

                  <td>
                    {product.category}
                  </td>

                  <td>
                    {product.brandName}
                  </td>

                  <td>

                    <span className="status registered">
                      {product.status === "REGISTERED" ? "Registered" : "—"}
                    </span>

                  </td>

                  <td>
                    {displayMetric(product.totalVerifications)}
                  </td>

                  <td>
                    {displayMetric(product.qrScans)}
                  </td>

                  <td>
                    {displayMetric(product.imageVerifications)}
                  </td>

                  <td>

                    <div className="table-actions">

                      <button
                        onClick={() =>
                          generateQR(product)
                        }
                      >
                        QR
                      </button>

                      <button
                        className="delete-button"
                        onClick={() =>
                          deleteProduct(product.productCode)
                        }
                      >
                        Delete
                      </button>

                    </div>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      )}

    </div>
  </>
);
  // =====================================================
  // REGISTER PAGE
  // =====================================================

const registerPage = (
      <>
      <PageHeader
        title="Register Product"
        subtitle="Register a new product in the Anti-Counterfeit system."
      />

      <div className="content-card form-card">

        <form
          onSubmit={registerProduct}
        >

          <div className="form-grid">

            <div className="form-group">

              <label>
                Product Name *
              </label>

              <input
                type="text"
                value={productName}
                onChange={(e) =>
                  setProductName(
                    e.target.value
                  )
                }
                placeholder="Enter product name"
              />

            </div>

            <div className="form-group">

              <label>
                Category *
              </label>

              <select
                value={productCategory}
                onChange={(e) =>
                  setProductCategory(
                    e.target.value
                  )
                }
              >

                <option value="">
                  Select category
                </option>

                <option value="Electronics">
                  Electronics
                </option>

                <option value="Medicine">
                  Medicine
                </option>

                <option value="Food">
                  Food
                </option>

                <option value="Cosmetics">
                  Cosmetics
                </option>

                <option value="Clothing">
                  Clothing
                </option>

                <option value="Other">
                  Other
                </option>

              </select>

            </div>

            <div className="form-group">

              <label>
                Brand *
              </label>

              <input
                type="text"
                value={productBrand}
                onChange={(e) =>
                  setProductBrand(
                    e.target.value
                  )
                }
                placeholder="Enter brand name"
              />

            </div>

            <div className="form-group">

              <label>
              Price (optional)
              </label>

              <input
                type="number"
                min="0"
                value={productPrice}
                onChange={(e) =>
                  setProductPrice(
                    e.target.value
                  )
                }
                placeholder="Enter price"
              />

            </div>

          </div>

          <div className="form-group">

            <label>
              Product Description
            </label>

            <textarea
              value={
                productDescription
              }
              onChange={(e) =>
                setProductDescription(
                  e.target.value
                )
              }
              placeholder="Enter product description"
              rows="5"
            />

          </div>
          <div className="form-group">

  <label>
    Batch Number *
  </label>

  <input
    type="text"
    value={batchNumber}
    onChange={(e) =>
      setBatchNumber(e.target.value)
    }
    placeholder="Enter batch number"
  />

</div>

<div className="form-grid">
  <div className="form-group">
    <label>Authorized Distributor *</label>
    <select value={selectedDistributor} onChange={(e) => setSelectedDistributor(e.target.value)} required>
      <option value="">Select an on-chain approved distributor</option>
      {distributors.map((partner) => (
        <option key={partner.id} value={partner.id}>
          {partner.companyName} — {partner.walletAddress}
        </option>
      ))}
    </select>
    {partnerLoadErrors.DISTRIBUTOR && <p className="partner-list-error" role="alert">{partnerLoadErrors.DISTRIBUTOR}</p>}
  </div>
  <div className="form-group">
    <label>Authorized Retailer *</label>
    <select value={selectedRetailer} onChange={(e) => setSelectedRetailer(e.target.value)} required>
      <option value="">Select an on-chain approved retailer</option>
      {retailers.map((partner) => (
        <option key={partner.id} value={partner.id}>
          {partner.companyName} — {partner.walletAddress}
        </option>
      ))}
    </select>
    {partnerLoadErrors.RETAILER && <p className="partner-list-error" role="alert">{partnerLoadErrors.RETAILER}</p>}
  </div>
</div>

<div className="form-group">

  <label>
    Manufacturing Date *
  </label>

  <input
    type="date"
    value={manufacturingDate}
    onChange={(e) =>
      setManufacturingDate(e.target.value)
    }
  />

</div>

<div className="form-group">

  <label>
    Reference Product Image *
  </label>

  <input
    type="file"
    accept="image/*"
    onChange={(e) =>
      setReferenceImage(e.target.files[0])
    }
  />

</div>
          <div className="form-actions">

            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                navigate("dashboard")
              }
            >
              Cancel
            </button>

            <button
              type="submit"
              className="primary-button"
              disabled={registrationBusy}
            >
              {registrationBusy
                ? "Processing registration…"
                : pendingRegistration?.status === "MINT_CONFIRMED" || pendingRegistration?.transactionHash
                  ? "Retry saving confirmed registration"
                  : pendingRegistration?.status === "MINT_SUBMITTING"
                    ? "Confirm existing transaction"
                    : pendingRegistration
                      ? "Continue prepared registration"
                      : "Prepare and mint with MetaMask →"}
            </button>

          </div>

        </form>

        {pendingRegistration && (
          <p role="status">
            {pendingRegistration.status === "PREPARED"
              ? "Registration and image are saved on the server before minting."
              : pendingRegistration.status === "MINT_SUBMITTING"
                ? "Mint submission was reserved. Do not submit another mint; provide the existing MetaMask transaction hash to continue."
                : "The mint is confirmed. Retry only saves this same transaction; it will not submit another mint."}
            <br />Product ID: {pendingRegistration.productCode}
            <br />Registration: {pendingRegistration.registrationId}
            {pendingRegistration.transactionHash && <><br />Transaction: {pendingRegistration.transactionHash}</>}
          </p>
        )}

        {pendingRegistration?.status === "MINT_SUBMITTING" && !pendingRegistration.transactionHash && (
          <div className="form-group">
            <label htmlFor="existing-mint-transaction">Existing MetaMask transaction hash</label>
            <input
              id="existing-mint-transaction"
              type="text"
              value={pendingTransactionHash}
              onChange={(event) => setPendingTransactionHash(event.target.value.trim())}
              placeholder="0x…"
              autoComplete="off"
            />
          </div>
        )}

      </div>
    </>
  );

  // =====================================================
  // QR PAGE + SCANNER
  // =====================================================

  const QRPage = () => (
    <>
      <PageHeader
        title="Generate QR Code"
        subtitle="Generate or scan QR codes for your registered products."
      />

      {/* =================================================
          SCANNER CARD
      ================================================= */}

      <div className="content-card scanner-card">

        <div className="card-title">

          <div>
            <h2>
              Scan QR Code
            </h2>

            <p>
              Scan a product QR code using your camera.
            </p>
          </div>

        </div>

        {/* SCANNER */}

        {scannerOpen && (

          <div className="scanner-wrapper">

            <div
              id="qr-reader"
              className="qr-reader"
            />

            <button
              className="secondary-button"
              onClick={stopScanner}
            >
              Stop Scanner
            </button>

          </div>

        )}

        {/* START SCANNER */}

        {!scannerOpen &&
          !scanResult && (

            <div className="scanner-start">

              <div className="scanner-icon">
                📷
              </div>

              <h3>
                Scan Product QR Code
              </h3>

              <p>
                Use your camera to scan a product QR code.
              </p>

              <button
                className="primary-button"
                onClick={startScanner}
                disabled={
                  isStartingScanner
                }
              >
                {isStartingScanner
                  ? "Opening Camera..."
                  : "📷 Start Scanner"}
              </button>

            </div>

          )}

        {/* ERROR */}

        {scannerError && (

          <div className="scanner-error">

            <strong>
              Camera Error
            </strong>

            <p>
              {scannerError}
            </p>

            <button
              className="primary-button"
              onClick={() => {
                setScannerError("");
                startScanner();
              }}
            >
              Try Again
            </button>

          </div>

        )}

        {/* SCAN RESULT */}

        {scanResult && (

          <div
            className={
              scanResult.found
                ? "scan-result genuine-result"
                : "scan-result fake-result"
            }
          >

            <div className="success-icon">

              {scanResult.found
                ? "✓"
                : "!"}

            </div>

            <div className="result-content">

              <h3>

                {scanResult.found
                  ? "Product Found"
                  : "Product Not Found"}

              </h3>

              {scanResult.found ? (

                <>
                  <p>This QR code matches a product in your manufacturer records. This lookup does not verify authenticity.</p>

                  <div className="scan-product-details">

                    <div>
                      <strong>
                        Product:
                      </strong>

                      <span>
                        {
                          scanResult
                            .product
                            .productName
                        }
                      </span>
                    </div>

                    <div>
                      <strong>
                        Product ID:
                      </strong>

                      <span>
                        {
                          scanResult
                            .product
                            .productCode
                        }
                      </span>
                    </div>

                    <div>
                      <strong>
                        Brand:
                      </strong>

                      <span>
                        {
                          scanResult
                            .product
                            .brand
                        }
                      </span>
                    </div>

                    <div>
                      <strong>
                        Category:
                      </strong>

                      <span>
                        {
                          scanResult
                            .product
                            .category
                        }
                      </span>
                    </div>

                    <div>
                      <strong>
                        Status:
                      </strong>

                      <span className="status registered">
                        Registered in your records
                      </span>
                    </div>

                  </div>
                </>

              ) : (

                <>
                  <p>
                    This QR code does not match any registered product.
                  </p>

                  <div className="result-value">
                    {scanResult.rawData}
                  </div>
                </>

              )}

            </div>

            <button
              className="primary-button"
              onClick={() => {
                setScanResult(null);
                setScannerError("");
              }}
            >
              Scan Again
            </button>

          </div>

        )}

      </div>

      {/* =================================================
          GENERATE QR
      ================================================= */}

      <div className="content-card">

        <div className="card-title">

          <div>
            <h2>
              Generate Product QR Codes
            </h2>

            <p>
              Generate a QR code for your registered products.
            </p>
          </div>

        </div>

        {products.length === 0 ? (

          <EmptyState
            icon="▦"
            title="No Products Available"
            text="Register a product before generating its QR code."
            button="Register Product"
            onClick={() =>
              navigate("register")
            }
          />

        ) : (

          <div className="product-grid">

            {products.map(
              (product) => (

                <div
                  className="product-qr-card"
                  key={product.id}
                >

                  <div className="qr-box">
                    ▦
                  </div>

                  <h3>
                    {product.productName}
                  </h3>

                  <p>
                    {product.productCode}
                  </p>

                  <button
                    className="primary-button full-width"
                    onClick={() =>
                      generateQR(
                        product
                      )
                    }
                  >
                    Generate QR
                  </button>

                </div>

              )
            )}

          </div>

        )}

      </div>
    </>
  );

  // =====================================================
  // MONITORING PAGE
  // =====================================================

  const MonitoringPage = () => {
    return (
      <>
        <PageHeader
          title="Product Monitoring"
          subtitle="Monitor product verification activity."
        />

        <LifecycleWorkflow role="MANUFACTURER" compact />

        <div className="stats-grid">

          <StatCard
            icon="📦"
            title="Products"
            value={displayMetric(productsLoaded ? products.length : null)}
          />

          <StatCard
            icon="📷"
            title="Total Verifications"
            value={displayMetric(sumProductMetric("totalVerifications"))}
          />

          <StatCard
            icon="▦"
            title="QR Scans"
            value={displayMetric(sumProductMetric("qrScans"))}
          />

          <StatCard
            icon="▧"
            title="Image Verifications"
            value={displayMetric(sumProductMetric("imageVerifications"))}
          />

        </div>

        <div className="content-card">

          <div className="card-title">

            <div>
              <h2>
                Product Monitoring
              </h2>

              <p>
                Current product verification status.
              </p>
            </div>

          </div>

          {products.length === 0 ? (

            <EmptyState
              icon="📊"
              title="No Monitoring Data"
              text="Register products to start monitoring."
              button="Register Product"
              onClick={() =>
                navigate("register")
              }
            />

          ) : (

            <div className="table-container">

              <table>

                <thead>

                  <tr>
                    <th>
                      Product
                    </th>

                    <th>
                      Product ID
                    </th>

                    <th>Registration</th>
                    <th>Total Verifications</th>
                    <th>QR Scans</th>
                    <th>Image Checks</th>
                    <th>Genuine Results</th>
                    <th>Suspicious Results</th>
                    <th>Fake Results</th>

                    <th>
                      Registered
                    </th>
                  </tr>

                </thead>

                <tbody>

                  {products.map(
                    (product) => (

                      <tr
                        key={product.id}
                      >

                        <td>
                          {product.productName}
                        </td>

                        <td>
                          {product.productCode}
                        </td>

                        <td>
                          <span className="status registered">
                            {product.status === "REGISTERED" ? "Registered" : "—"}
                          </span>
                        </td>

                        <td>
                          {displayMetric(product.totalVerifications)}
                        </td>

                        <td>
                          {displayMetric(product.qrScans)}
                        </td>

                        <td>
                          {displayMetric(product.imageVerifications)}
                        </td>

                        <td className="green-text">
                          {displayMetric(product.verificationStatusCounts?.GENUINE)}
                        </td>

                        <td className="red-text">
                          {displayMetric(product.verificationStatusCounts?.SUSPICIOUS)}
                        </td>
                        <td className="red-text">
                          {displayMetric(product.verificationStatusCounts?.FAKE)}
                        </td>
                        <td>{product.createdAt ? new Date(product.createdAt).toLocaleDateString() : "—"}</td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>

          )}

        </div>
      </>
    );
  };

  // =====================================================
  // PROFILE PAGE
  // =====================================================

  const ProfilePage = () => (

    <>
      <WalletBinding />
      <PageHeader
        title="Manufacturer Profile"
        subtitle="Manage your manufacturer account information."
      />

      <div className="content-card profile-card">

        <div className="profile-avatar">
          {profile.name
            ? profile.name
                .charAt(0)
                .toUpperCase()
            : "M"}
        </div>

        <h2>
          {profile.name}
        </h2>

        <p>
          {profile.company}
        </p>

        <div className="profile-info">

          <div>
            <strong>
              Account Type
            </strong>

            <span>
              Manufacturer
            </span>
          </div>

          <div>
            <strong>
              Email
            </strong>

            <span>
              {profile.email}
            </span>
          </div>

          <div>
            <strong>
              Products
            </strong>

            <span>
              {products.length}
            </span>
          </div>

          <div>
            <strong>
              Status
            </strong>

            <span className="green-text">
              Active
            </span>
          </div>

        </div>

        <button
          className="primary-button"
          onClick={() =>
            setShowProfileEdit(
              !showProfileEdit
            )
          }
        >
          {showProfileEdit
            ? "Close"
            : "Edit Profile"}
        </button>

      </div>

      {showProfileEdit && (

        <form
          className="content-card profile-form"
          onSubmit={saveProfile}
        >

          <h2>
            Edit Profile
          </h2>

          <div className="form-grid">

            <div className="form-group">

              <label>
                Full Name
              </label>

              <input
                value={profileForm.name}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    name: e.target.value,
                  })
                }
              />

            </div>

            <div className="form-group">

              <label>
                Company
              </label>

              <input
                value={
                  profileForm.company
                }
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    company:
                      e.target.value,
                  })
                }
              />

            </div>

            <div className="form-group">

              <label>
                Email
              </label>

              <input
                type="email"
                value={
                  profileForm.email
                }
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    email:
                      e.target.value,
                  })
                }
              />

            </div>

            <div className="form-group">

              <label>
                Phone
              </label>

              <input
                value={
                  profileForm.phone
                }
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    phone:
                      e.target.value,
                  })
                }
              />

            </div>

            <div className="form-group full">

              <label>
                Address
              </label>

              <textarea
                value={
                  profileForm.address
                }
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    address:
                      e.target.value,
                  })
                }
              />

            </div>

          </div>

          <button
            type="submit"
            className="primary-button"
          >
            Save Changes
          </button>

        </form>

      )}

    </>
  );

  // =====================================================
  // PAGE ROUTER
  // =====================================================

  const renderPage = () => {

    switch (activePage) {

      case "dashboard":
        return <Dashboard />;

      case "products":
        return <ProductsPage />;

      case "register":
        return registerPage;

      case "qr":
        return <QRPage />;

      case "monitoring":
        return <MonitoringPage />;

      case "profile":
        return <ProfilePage />;

      default:
        return <Dashboard />;
    }
  };

  // =====================================================
  // MAIN UI
  // =====================================================

  return (

    <div className="manufacturer-app">

      {/* SIDEBAR */}

      <aside className="sidebar">

        <div className="brand">

          <img
            src="/logo.png"
            alt="Anti-Counterfeit"
          />

          <div>

            <h2>
              Anti-Counterfeit
            </h2>

            <p>
              AI-Powered Blockchain
              <br />
              Product Verification
            </p>

          </div>

        </div>

        <nav>

          <NavItem
            icon="⌂"
            text="Dashboard"
            active={
              activePage ===
              "dashboard"
            }
            onClick={() =>
              navigate("dashboard")
            }
          />

          <NavItem
            icon="♙"
            text="Profile"
            active={
              activePage ===
              "profile"
            }
            onClick={() =>
              navigate("profile")
            }
          />

          <NavItem
            icon="＋"
            text="Register Product"
            active={
              activePage ===
              "register"
            }
            onClick={() =>
              navigate("register")
            }
          />

          <NavItem
            icon="📦"
            text="My Products"
            active={
              activePage ===
              "products"
            }
            onClick={() =>
              navigate("products")
            }
          />

          <NavItem
            icon="▦"
            text="Generate QR"
            active={
              activePage ===
              "qr"
            }
            onClick={() =>
              navigate("qr")
            }
          />

          <NavItem
            icon="📊"
            text="Product Monitoring"
            active={
              activePage ===
              "monitoring"
            }
            onClick={() =>
              navigate("monitoring")
            }
          />

        </nav>

        <div className="sidebar-bottom">

          <button
            className="profile-button"
            onClick={() =>
              navigate("profile")
            }
          >

            <div className="small-avatar">
              {profile.name
                ? profile.name
                    .charAt(0)
                    .toUpperCase()
                : "M"}
            </div>

            <div>

              <strong>
                {profile.name}
              </strong>

              <span>
                Manufacturer Account
              </span>

            </div>

          </button>

          <button
            className="logout-button"
            onClick={() => {

              if (onLogout) {
                onLogout();
              } else {
                alert(
                  "Logged out successfully."
                );
              }

            }}
          >
            ⇥ Logout
          </button>

        </div>

      </aside>

      {/* MAIN */}

      <main className="main-content">

        <header className="topbar">

          <div className="search-box">

            🔍

            <input
              placeholder="Search anything..."
            />

          </div>

          <div className="top-actions">

            <button>
              🔔
            </button>

            <button>
              ⚙
            </button>

            <div className="user-info">

              <div className="user-avatar">
                {profile.name
                  ? profile.name
                      .charAt(0)
                      .toUpperCase()
                  : "M"}
              </div>

              <div>

                <strong>
                  {profile.name}
                </strong>

                <span>
                  Manufacturer Account
                </span>

              </div>

              <span>
                ˅
              </span>

            </div>

          </div>

        </header>

        <section className="page-content">

          {renderPage()}

        </section>

      </main>

    </div>
  );
}

// =====================================================
// PAGE HEADER
// =====================================================

function PageHeader({
  title,
  subtitle,
}) {

  return (

    <div className="page-header">

      <h1>
        {title}
      </h1>

      <p>
        {subtitle}
      </p>

    </div>
  );
}

// =====================================================
// NAV ITEM
// =====================================================

function NavItem({
  icon,
  text,
  active,
  onClick,
}) {

  return (

    <button
      className={
        active
          ? "nav-item active"
          : "nav-item"
      }
      onClick={onClick}
    >

      <span>
        {icon}
      </span>

      {text}

    </button>
  );
}

// =====================================================
// STAT CARD
// =====================================================

function StatCard({
  icon,
  title,
  value,
  danger,
}) {

  return (

    <div className="stat-card">

      <div
        className={
          danger
            ? "stat-icon danger"
            : "stat-icon"
        }
      >
        {icon}
      </div>

      <div>

        <span>
          {title}
        </span>

        <strong>
          {value}
        </strong>

        <small
          className={
            danger
              ? "red-text"
              : "green-text"
          }
        >
          {danger
            ? "Requires attention"
            : "Updated information"}
        </small>

      </div>

    </div>
  );
}

// =====================================================
// EMPTY STATE
// =====================================================

function EmptyState({
  icon,
  title,
  text,
  button,
  onClick,
}) {

  return (

    <div className="empty-state">

      <div className="empty-icon">
        {icon}
      </div>

      <h3>
        {title}
      </h3>

      <p>
        {text}
      </p>

      <button
        className="primary-button"
        onClick={onClick}
      >
        {button}
      </button>

    </div>
  );
}

export default ManufacturerDashboard;
