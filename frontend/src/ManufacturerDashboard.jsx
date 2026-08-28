import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import { Html5Qrcode } from "html5-qrcode";

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
      "http://localhost:5000/api/products/my-products",
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

  const registerProduct = async (e) => {
  e.preventDefault();

  if (
  !productName.trim() ||
  !productCategory ||
  !productBrand.trim() ||
  !productPrice ||
  !batchNumber ||
  !manufacturingDate ||
  !referenceImage
) {
  alert("Please fill all required fields.");
  return;
} 

  try {
    const token = localStorage.getItem("token");

    if (!token) {
      alert("Login session expired. Please login again.");
      return;
    }

    const formData = new FormData();

    formData.append("productName", productName.trim());
    formData.append("category", productCategory);
    formData.append("brandName", productBrand.trim());

    
    formData.append("batchNumber", batchNumber);
    formData.append("manufacturingDate", manufacturingDate);
    formData.append("referenceImage", referenceImage);
    const response = await fetch(
      "http://localhost:5000/api/products/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || "Product registration failed"
      );
    }

    alert(
      `Product registered successfully!\nProduct Code: ${data.product.productCode}`
    );

    // Get the newly registered product from MongoDB
    await fetchMyProducts();

    // Clear form
    setProductName("");
    setProductCategory("");
    setProductBrand("");
    setProductPrice("");
    setProductDescription("");
    setBatchNumber("");
    setManufacturingDate("");
    setReferenceImage(null);
    navigate("products");

  } catch (error) {
    console.error(
      "Product registration error:",
      error
    );

    alert(error.message);
  }
};
  // =====================================================
  // DELETE PRODUCT
  // =====================================================

  const deleteProduct = (id) => {

    const confirmed =
      window.confirm(
        "Are you sure you want to delete this product?"
      );

    if (!confirmed) return;

    setProducts((previous) =>
      previous.filter(
        (product) => product.id !== id
      )
    );

    alert("Product deleted successfully.");
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
      category: product.category
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

            // Increase scan count
            setProducts((previous) =>
              previous.map((product) => {

                if (
                  product.id ===
                  matchingProduct.id
                ) {
                  return {
                    ...product,

                    scans:
                      Number(
                        product.scans || 0
                      ) + 1,

                    genuineScans:
                      Number(
                        product.genuineScans || 0
                      ) + 1,
                  };
                }

                return product;
              })
            );

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

    const totalProducts =
      products.length;

   const totalScans = products.reduce(
  (sum, product) =>
    sum + Number(product.totalScans || 0),
  0
);

    const genuineScans =
      products.reduce(
        (sum, product) =>
          sum +
          Number(
            product.genuineScans || 0
          ),
        0
      );

    const counterfeitScans =
      products.reduce(
        (sum, product) =>
          sum +
          Number(
            product.counterfeitScans ||
              0
          ),
        0
      );

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
            value={totalProducts}
          />

          <StatCard
            icon="▦"
            title="Total Scans"
            value={totalScans}
          />

          <StatCard
            icon="✓"
            title="Genuine Scans"
            value={genuineScans}
          />

          <StatCard
            icon="⚠"
            title="Counterfeit Detected"
            value={counterfeitScans}
            danger
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

                      <span className="status genuine">
                        ✓ Genuine
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
                        key={product.id}
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
                          <span className="status genuine">
                            ✓ Genuine
                          </span>
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
                <th>Status</th>
                <th>Scans</th>
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

                    <span
                      className={
                        product.verificationStatus === "GENUINE"
                          ? "status genuine"
                          : product.verificationStatus === "SUSPICIOUS"
                          ? "status suspicious"
                          : "status fake"
                      }
                    >
                      {product.verificationStatus === "GENUINE"
                        ? "✓ Genuine"
                        : product.verificationStatus === "SUSPICIOUS"
                        ? "⚠ Suspicious"
                        : "✕ Fake"}
                    </span>

                  </td>

                  <td>
                    {product.totalScans || 0}
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
                          deleteProduct(product._id)
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
                Price *
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
            >
              Register Product →
            </button>

          </div>

        </form>

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
                  <p>
                    This QR code belongs to a registered product.
                  </p>

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

                      <span className="green-text">
                        ✓ Genuine
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

    const totalScans = products.reduce(
  (sum, product) =>
    sum + Number(product.totalScans || 0),
  0
);

    const genuine =
      products.reduce(
        (sum, product) =>
          sum +
          Number(
            product.genuineScans || 0
          ),
        0
      );

    const counterfeit =
      products.reduce(
        (sum, product) =>
          sum +
          Number(
            product.counterfeitScans ||
              0
          ),
        0
      );

    return (
      <>
        <PageHeader
          title="Product Monitoring"
          subtitle="Monitor product verification activity."
        />

        <div className="stats-grid">

          <StatCard
            icon="📦"
            title="Products"
            value={products.length}
          />

          <StatCard
            icon="✓"
            title="Genuine"
            value={genuine}
          />

          <StatCard
            icon="📷"
            title="Total Scans"
            value={totalScans}
          />

          <StatCard
            icon="⚠"
            title="Counterfeit"
            value={counterfeit}
            danger
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

                    <th>
                      Status
                    </th>

                    <th>
                      Scans
                    </th>

                    <th>
                      Genuine
                    </th>

                    <th>
                      Counterfeit
                    </th>

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
                          <span className="status genuine">
                            ✓ Genuine
                          </span>
                        </td>

                        <td>
                          {product.totalScans || 0}
                        </td>

                        <td className="green-text">
                          {
                            product.genuineScans ||
                            0
                          }
                        </td>

                        <td className="red-text">
                          {
                            product.counterfeitScans ||
                            0
                          }
                        </td>
                        <td>
                           {
                             product.createdAt
                             ? new Date(product.createdAt).toLocaleDateString()
                             : "-"
                            }
                        </td>

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