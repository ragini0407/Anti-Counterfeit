import "./App.css";

function Home({ onLogin, onVerify }) {
  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
    });
  };

  return (
    <div className="app">

      {/* ================= NAVBAR ================= */}
      <header className="navbar">

        <div className="logo-section">

          <img
            src="/logo.png"
            alt="Anti-Counterfeit"
            className="logo"
          />

          <div className="brand-text">
            <h1>
              Anti-<span>Counterfeit</span>
            </h1>

            <p>
              AI-Powered Blockchain Product Verification
            </p>
          </div>

        </div>


        <nav className="nav-links">

          <button
            type="button"
            onClick={() => scrollToSection("home")}
          >
            Home
          </button>

          <button
            type="button"
            onClick={() => scrollToSection("about")}
          >
            About Us
          </button>

          <button
            type="button"
            onClick={() =>
              scrollToSection("how-it-works")
            }
          >
            How It Works
          </button>

          <button
            type="button"
            onClick={() =>
              scrollToSection("features")
            }
          >
            Features
          </button>

          <button
            type="button"
            onClick={() =>
              scrollToSection("contact")
            }
          >
            Contact
          </button>

        </nav>


        {/* ================= LOGIN BUTTON ================= */}

        <button
          type="button"
          className="nav-login-btn"
          onClick={onLogin}
        >
          👤 Login →
        </button>

      </header>


      {/* ================= HOME ================= */}

      <section
        id="home"
        className="home-section"
      >

        <div className="home-content">

          <div className="left-content">

            {/* TRUST BADGE */}

            <div className="trust-badge">

              🛡️ &nbsp; Secure

              <span>•</span>

              Transparent

              <span>•</span>

              Trustworthy

            </div>


            {/* HERO TITLE */}

            <h2>
              Verify. <span>Trust.</span> Protect.
            </h2>


            {/* HERO DESCRIPTION */}

            <p className="hero-description">

              Stop fake products. Start smarter
              verification. Our AI-powered blockchain
              system helps you verify product authenticity
              in seconds, ensuring a safer and more trusted
              marketplace for everyone.

            </p>


            {/* HERO BUTTONS */}

            <div className="hero-buttons">

              <button
                type="button"
                className="verify-btn"
                onClick={onVerify}
>
              
                ⛶ &nbsp; Verify Now &nbsp; →
              </button>


              <button
                type="button"
                className="learn-btn"
                onClick={() =>
                  scrollToSection("how-it-works")
                }
              >
                ▶ &nbsp; Learn More
              </button>

            </div>


            {/* ================= STATISTICS ================= */}

            <div className="stats">

              <div className="stat-card">

                <div className="stat-icon">
                  🛡️
                </div>

                <h3>
                  99.8%
                </h3>

                <p>
                  Detection Accuracy
                </p>

              </div>



              <div className="stat-card">

                <div className="stat-icon">
                  ⚡
                </div>

                <h3>
                  2s
                </h3>

                <p>
                  Instant Verification
                </p>

              </div>

            </div>

          </div>


          {/* ================= HERO IMAGE ================= */}

          <div className="hero-image-container">

            <img
              src="/hero.png"
              alt="Product Verification"
              className="hero-image"
            />

          </div>

        </div>


        {/* ================= BOTTOM FEATURE BAR ================= */}

        <div className="feature-bar">

          <div className="feature-item">

            <div className="feature-icon">
              🤖
            </div>

            <div>

              <h4>
                AI Detection
              </h4>

              <p>
                Smart analysis detects fake
                <br />
                products with high accuracy.
              </p>

            </div>

          </div>


          <div className="feature-item">

            <div className="feature-icon green">
              ⬡
            </div>

            <div>

              <h4>
                Blockchain Security
              </h4>

              <p>
                Immutable records ensure
                <br />
                tamper-proof data.
              </p>

            </div>

          </div>


          <div className="feature-item">

            <div className="feature-icon">
              ▣
            </div>

            <div>

              <h4>
                Instant Verification
              </h4>

              <p>
                Scan & verify in seconds.
              </p>

            </div>

          </div>


          <div className="feature-item">

            <div className="feature-icon">
              👥
            </div>

            <div>

              <h4>
                Consumer Protection
              </h4>

              <p>
                Keeping you and your family safe.
              </p>

            </div>

          </div>

        </div>

      </section>


      {/* ================= ABOUT US ================= */}

      <section
        id="about"
        className="about-section"
      >

        <div className="section-heading">

          <span>
            ABOUT US
          </span>

          <h2>
            Building a <strong>Trusted</strong> Marketplace
          </h2>

          <p>
            Anti-Counterfeit is an AI-powered
            blockchain product verification platform
            designed to help consumers identify
            genuine products and protect themselves
            from counterfeit goods.
          </p>

        </div>


        <div className="about-container">

          <div className="about-text">

            <h3>
              About Anti-Counterfeit
            </h3>

            <p>
              Counterfeit products are a growing
              problem that can affect consumers,
              businesses, and brands. Our platform
              combines Artificial Intelligence,
              Blockchain, and QR Code technology
              to make product verification simple,
              fast, and reliable.
            </p>

            <p>
              Consumers can scan a product QR code
              and receive verification information
              within seconds. The system uses secure
              records and intelligent analysis to help
              determine whether a product is authentic
              or suspicious.
            </p>


            <div className="mission-box">

              <h3>
                Our Mission
              </h3>

              <p>
                Our mission is to create a safer and
                more transparent marketplace where
                consumers can easily verify products
                and businesses can build trust with
                their customers.
              </p>

            </div>

          </div>


          <div className="about-cards">

            <div className="about-card">

              <div className="about-icon">
                🤖
              </div>

              <h3>
                AI Detection
              </h3>

              <p>
                Smart AI analysis helps identify
                suspicious and counterfeit products.
              </p>

            </div>


            <div className="about-card">

              <div className="about-icon">
                🔗
              </div>

              <h3>
                Blockchain
              </h3>

              <p>
                Secure and tamper-resistant records
                provide trusted verification.
              </p>

            </div>


            <div className="about-card">

              <div className="about-icon">
                ▣
              </div>

              <h3>
                QR Verification
              </h3>

              <p>
                Quickly verify products by scanning
                their unique QR codes.
              </p>

            </div>


            <div className="about-card">

              <div className="about-icon">
                🛡️
              </div>

              <h3>
                Consumer Protection
              </h3>

              <p>
                Helping customers make safer and
                more confident purchasing decisions.
              </p>

            </div>

          </div>

        </div>

      </section>


      {/* ================= HOW IT WORKS ================= */}

      <section
        id="how-it-works"
        className="how-section"
      >

        <div className="section-heading">

          <span>
            HOW IT WORKS
          </span>

          <h2>
            Verify Products in <strong>4 Simple Steps</strong>
          </h2>

          <p>
            Our verification process is designed
            to be simple, fast, and easy for everyone.
          </p>

        </div>


        <div className="steps-container">

          <div className="step-card">

            <div className="step-number">
              01
            </div>

            <div className="step-icon">
              ▣
            </div>

            <h3>
              Scan QR Code
            </h3>

            <p>
              Scan the unique QR code attached
              to the product using your smartphone.
            </p>

          </div>


          <div className="step-card">

            <div className="step-number">
              02
            </div>

            <div className="step-icon">
              📦
            </div>

            <h3>
              Identify Product
            </h3>

            <p>
              The system retrieves the product
              information associated with the QR code.
            </p>

          </div>


          <div className="step-card">

            <div className="step-number">
              03
            </div>

            <div className="step-icon">
              🔐
            </div>

            <h3>
              AI + Blockchain
            </h3>

            <p>
              AI analyzes the product while blockchain
              provides secure and tamper-resistant
              verification records.
            </p>

          </div>


          <div className="step-card">

            <div className="step-number">
              04
            </div>

            <div className="step-icon">
              ✅
            </div>

            <h3>
              Get Result
            </h3>

            <p>
              Receive an instant result showing whether
              the product is authentic or suspicious.
            </p>

          </div>

        </div>


        {/* VERIFICATION RESULTS */}

        <div className="verification-result">

          <div className="result authentic">

            <span>
              ✓
            </span>

            <div>

              <h3>
                Authentic Product
              </h3>

              <p>
                Product verified successfully.
              </p>

            </div>

          </div>


          <div className="result suspicious">

            <span>
              !
            </span>

            <div>

              <h3>
                Suspicious Product
              </h3>

              <p>
                Product requires further verification.
              </p>

            </div>

          </div>

        </div>

      </section>


      {/* ================= FEATURES ================= */}

      <section
        id="features"
        className="features-section"
      >

        <div className="section-heading">

          <span>
            FEATURES
          </span>

          <h2>
            Powerful <strong>Protection</strong>
          </h2>

          <p>
            Technology designed to make product
            verification faster and more trustworthy.
          </p>

        </div>


        <div className="features-grid">

          <div className="large-feature">

            <div className="feature-large-icon">
              🤖
            </div>

            <h3>
              AI-Powered Detection
            </h3>

            <p>
              Advanced AI models analyze product
              information and help detect fake or
              suspicious products.
            </p>

          </div>


          <div className="large-feature">

            <div className="feature-large-icon">
              🔗
            </div>

            <h3>
              Blockchain Security
            </h3>

            <p>
              Immutable records provide transparency,
              traceability, and data integrity.
            </p>

          </div>


          <div className="large-feature">

            <div className="feature-large-icon">
              ⚡
            </div>

            <h3>
              Instant Verification
            </h3>

            <p>
              Scan a QR code and receive product
              verification results within seconds.
            </p>

          </div>


          <div className="large-feature">

            <div className="feature-large-icon">
              🛡️
            </div>

            <h3>
              Consumer Protection
            </h3>

            <p>
              Empowering consumers with trust and
              confidence to make safer purchasing
              decisions.
            </p>

          </div>

        </div>

      </section>


      {/* ================= CONTACT ================= */}

      <section
        id="contact"
        className="contact-section"
      >

        <div className="section-heading">

          <span>
            CONTACT
          </span>

          <h2>
            Get in <strong>Touch</strong>
          </h2>

          <p>
            Have questions about product verification?
            We'd love to hear from you.
          </p>

        </div>


        <div className="contact-container">

          <div className="contact-info">

            <h3>
              Anti-Counterfeit
            </h3>

            <p>
              AI-Powered Blockchain Product Verification
            </p>

            <p>
              📧 support@anticounterfeit.com
            </p>

            <p>
              📞 +91 98765 43210
            </p>

            <p>
              📍 Bengaluru, Karnataka, India
            </p>

          </div>


          <form
            className="contact-form"
            onSubmit={(e) => {
              e.preventDefault();
              alert("Message sent successfully!");
            }}
          >

            <input
              type="text"
              placeholder="Your Name"
            />

            <input
              type="email"
              placeholder="Your Email"
            />

            <textarea
              placeholder="Your Message"
              rows="5"
            />

            <button type="submit">
              Send Message →
            </button>

          </form>

        </div>

      </section>


      {/* ================= FOOTER ================= */}

      <footer>

        <h3>
          Anti-Counterfeit
        </h3>

        <p>
          AI-Powered Blockchain Product Verification
        </p>

        <p>
          © 2026 Anti-Counterfeit. All Rights Reserved.
        </p>

      </footer>

    </div>
  );
}

export default Home;