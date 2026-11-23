const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const env = require('../config/env');

function seedDatabase(db) {
  const rounds = env.BCRYPT_ROUNDS;
  const adminPasswordHash = bcrypt.hashSync('Admin@123456', rounds);
  const customerPasswordHash = bcrypt.hashSync('Customer@123456', rounds);
  const vipPasswordHash = bcrypt.hashSync('Layla@123456', rounds);

  const adminId = 'usr-admin-0001';
  const customerId = 'usr-cust-0001';
  const vipCustomerId = 'usr-cust-0002';

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, phone, address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  insertUser.run(
    adminId,
    'Elena Vance (Executive Admin)',
    'admin@aura-atelier.com',
    adminPasswordHash,
    'admin',
    '+1 (555) 234-8900',
    JSON.stringify({
      fullName: 'Elena Vance',
      street: '742 Evergreen Terrace, Suite 900',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94107',
      country: 'United States',
      phone: '+1 (555) 234-8900',
    })
  );

  insertUser.run(
    customerId,
    'Marcus Sterling',
    'customer@aura-atelier.com',
    customerPasswordHash,
    'customer',
    '+1 (555) 876-5432',
    JSON.stringify({
      fullName: 'Marcus Sterling',
      street: '450 Mercer Street, Apt 12B',
      city: 'New York',
      state: 'NY',
      postalCode: '10013',
      country: 'United States',
      phone: '+1 (555) 876-5432',
    })
  );

  insertUser.run(
    vipCustomerId,
    'Layla Al-Mansoor',
    'layla@aura-atelier.com',
    vipPasswordHash,
    'customer',
    '+971 50 482 9103',
    JSON.stringify({
      fullName: 'Layla Al-Mansoor',
      street: 'DIFC Gate Village 4, Penthouse 18',
      city: 'Dubai',
      state: 'Dubai',
      postalCode: '00000',
      country: 'UAE',
      phone: '+971 50 482 9103',
    })
  );

  // Create default carts for users
  const insertCart = db.prepare(`INSERT INTO carts (id, user_id) VALUES (?, ?)`);
  insertCart.run('cart-admin-0001', adminId);
  insertCart.run('cart-cust-0001', customerId);
  insertCart.run('cart-cust-0002', vipCustomerId);

  // Categories
  const categories = [
    {
      id: 'cat-audio',
      name: 'Acoustics & Spatial Audio',
      slug: 'acoustics-spatial-audio',
      description: 'Reference-grade planar headphones, sculptural wireless speakers, and lossless DAC amplifiers.',
      image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85',
      is_active: 1,
    },
    {
      id: 'cat-horology',
      name: 'Horology & Smart Wearables',
      slug: 'horology-wearables',
      description: 'Titanium chronographs, sapphire-crystal neural rings, and minimalist mechanical timepieces.',
      image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=85',
      is_active: 1,
    },
    {
      id: 'cat-workspace',
      name: 'Architectural Workspace',
      slug: 'architectural-workspace',
      description: 'CNC-machined mechanical keyboards, OLED desk lighting, and anodized aluminum studio accessories.',
      image_url: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=900&q=85',
      is_active: 1,
    },
    {
      id: 'cat-optics',
      name: 'Optics & Imaging',
      slug: 'optics-imaging',
      description: 'Full-frame rangefinder cameras, prime aspherical lenses, and carbon-fiber gimbals.',
      image_url: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=85',
      is_active: 1,
    },
    {
      id: 'cat-skincare',
      name: 'Cellular Apothecary',
      slug: 'skincare',
      description: 'Bio-fermented serums, molecular peptide concentrates, and cold-pressed botanical elixirs.',
      image_url: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=900&q=85',
      is_active: 1,
    },
  ];

  const insertCategory = db.prepare(`
    INSERT INTO categories (id, name, slug, description, image_url, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const c of categories) {
    insertCategory.run(c.id, c.name, c.slug, c.description, c.image_url, c.is_active);
  }

  // Products
  const products = [
    {
      id: 'prd-001',
      category_id: 'cat-audio',
      title: 'AURA Sovereign Planar Wireless Headphones',
      slug: 'aura-sovereign-planar-wireless-headphones',
      description:
        'Precision-milled from a single block of bead-blasted Grade 5 titanium and wrapped in full-grain Italian lambskin. Equipped with 50mm ultra-thin planar magnetic transducers, adaptive hybrid ANC, and 60-hour lossless USB-C & LDAC playback.',
      price: 590.0,
      discount_price: 495.0,
      stock_qty: 18,
      sku: 'AUR-AUD-001',
      featured: 1,
      rating_avg: 4.9,
      rating_count: 2,
      sales_count: 142,
      images: [
        'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1000&q=85',
        'https://images.unsplash.com/photo-1484704849700-f032a568e944?auto=format&fit=crop&w=1000&q=85',
        'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=1000&q=85',
      ],
      specs: {
        Driver: '50mm Nanoscale Planar Magnetic',
        Chassis: 'Grade 5 Brushed Titanium & Nappa Leather',
        Battery: '60 Hours ANC On / 85 Hours Passive',
        Connectivity: 'Bluetooth 5.4 Lossless, USB-C 32-bit/384kHz DAC',
        Weight: '315g',
      },
    },
    {
      id: 'prd-002',
      category_id: 'cat-audio',
      title: 'Monolith K1 Omnidirectional Acoustic Sculpture',
      slug: 'monolith-k1-omnidirectional-acoustic-sculpture',
      description:
        'An architectural 360-degree studio monitor housed in hand-cast acoustic concrete and brushed brass. Delivers room-filling holographic soundstage with room-calibration DSP and AirPlay 2 / Tidal Connect.',
      price: 890.0,
      discount_price: 780.0,
      stock_qty: 4, // Low stock alert candidate (<= 5)
      sku: 'AUR-AUD-002',
      featured: 1,
      rating_avg: 4.8,
      rating_count: 1,
      sales_count: 89,
      images: [
        'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=1000&q=85',
        'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=1000&q=85',
      ],
      specs: {
        Amplification: '450W Class-D Tri-Amped',
        FrequencyResponse: '26 Hz – 28,000 Hz (-3dB)',
        Finish: 'Obsidian Acoustic Concrete & PVD Gold',
        Wireless: 'Wi-Fi 6E, AirPlay 2, Spotify/Tidal Connect',
      },
    },
    {
      id: 'prd-003',
      category_id: 'cat-horology',
      title: 'Chronos V4 Titanium Automatic Chronograph',
      slug: 'chronos-v4-titanium-automatic-chronograph',
      description:
        'Swiss-calibrated high-beat automatic movement with an open-worked skeleton dial, double-domed AR sapphire crystal, and integrated micro-adjustable Grade 5 titanium bracelet.',
      price: 1250.0,
      discount_price: 1090.0,
      stock_qty: 9,
      sku: 'AUR-HOR-001',
      featured: 1,
      rating_avg: 5.0,
      rating_count: 2,
      sales_count: 118,
      images: [
        'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1000&q=85',
        'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1000&q=85',
      ],
      specs: {
        CaseDiameter: '40.5mm Grade 5 Titanium',
        Movement: 'Calibre AU-88 Automatic (72h Power Reserve)',
        Crystal: 'Box-Domed Sapphire with Dual Anti-Reflective Coating',
        WaterResistance: '10 ATM / 100 Meters',
      },
    },
    {
      id: 'prd-004',
      category_id: 'cat-horology',
      title: 'Halo Biometric Ceramic Smart Ring Gen-3',
      slug: 'halo-biometric-ceramic-smart-ring-gen-3',
      description:
        'Featherweight zirconia ceramic biometric ring that tracks HRV, deep sleep architecture, VO2 max, and skin temperature fluctuations with clinical-grade infrared photoplethysmography.',
      price: 349.0,
      discount_price: 299.0,
      stock_qty: 27,
      sku: 'AUR-HOR-002',
      featured: 0,
      rating_avg: 4.7,
      rating_count: 1,
      sales_count: 215,
      images: [
        'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1000&q=85',
      ],
      specs: {
        Material: 'Aerospace Zirconia Ceramic & Titanium Inner Shell',
        BatteryLife: '8 Days Continuous Telemetry',
        WaterResistance: '100m Submersible',
        Sensors: 'Dual-Wavelength PPG, 3D Accelerometer, NTC Temp',
      },
    },
    {
      id: 'prd-005',
      category_id: 'cat-workspace',
      title: 'Type-65 Custom CNC Gasket Mechanical Keyboard',
      slug: 'type-65-custom-cnc-gasket-mechanical-keyboard',
      description:
        '65% wireless mechanical keyboard machined from solid 6063 billet aluminum with a mirror-polished PVD brass weight, hot-swappable lubed linear switches, and QMK/VIA programmable rotary encoder.',
      price: 420.0,
      discount_price: 365.0,
      stock_qty: 14,
      sku: 'AUR-WRK-001',
      featured: 1,
      rating_avg: 4.9,
      rating_count: 1,
      sales_count: 174,
      images: [
        'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=1000&q=85',
        'https://images.unsplash.com/photo-1595225476474-87563907a212?auto=format&fit=crop&w=1000&q=85',
      ],
      specs: {
        Mount: 'Isolated Silicone Leaf-Spring Gasket Mount',
        Case: '2.4kg CNC 6063 Anodized Aluminum + Brass Weight',
        Switches: 'AURA Linear POM Switches (Factory Krytox 205g0)',
        Firmware: 'QMK / VIA Open-Source Tri-Mode Wireless',
      },
    },
    {
      id: 'prd-006',
      category_id: 'cat-workspace',
      title: 'Lumina Cantilever Architect Desk Light Bar',
      slug: 'lumina-cantilever-architect-desk-light-bar',
      description:
        'Counterbalanced aluminum task lamp featuring CRI 98+ full-spectrum circadian LEDs, asymmetric anti-glare optics for studio displays, and a wireless desktop puck controller.',
      price: 260.0,
      discount_price: null,
      stock_qty: 3, // Low stock alert candidate (<= 5)
      sku: 'AUR-WRK-002',
      featured: 0,
      rating_avg: 4.8,
      rating_count: 1,
      sales_count: 64,
      images: [
        'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1000&q=85',
      ],
      specs: {
        ColorRendering: 'CRI 98+ Ra (2700K – 6500K Stepless)',
        Illumination: '1200 Lux Center Studio Spread',
        Control: '2.4GHz Machined Aluminum Rotary Puck',
        Power: 'USB-C PD 30W',
      },
    },
    {
      id: 'prd-007',
      category_id: 'cat-optics',
      title: 'Leitz M-Series Full-Frame Digital Rangefinder Body',
      slug: 'leitz-m-series-full-frame-digital-rangefinder',
      description:
        'Bespoke 60MP BSI CMOS full-frame rangefinder camera with triple-resolution DNG capture, brass top plate in matte black paint finish, and 15-stop dynamic range.',
      price: 2450.0,
      discount_price: 2190.0,
      stock_qty: 2, // Low stock alert candidate (<= 5)
      sku: 'AUR-OPT-001',
      featured: 1,
      rating_avg: 5.0,
      rating_count: 1,
      sales_count: 37,
      images: [
        'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1000&q=85',
        'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=1000&q=85',
      ],
      specs: {
        Sensor: '60.3MP Full-Frame BSI CMOS (Maestro IV Processor)',
        Storage: '256GB Internal UFS + UHS-II SD Slot',
        Viewfinder: '0.73x Optical Bright-Line Rangefinder',
        Body: 'Magnesium Alloy & Solid Brass Top Deck',
      },
    },
    {
      id: 'prd-008',
      category_id: 'cat-skincare',
      title: 'Cellular Nectar Bio-Peptide Night Repair Serum',
      slug: 'cellular-nectar-bio-peptide-night-repair-serum',
      description:
        'High-potency dermatological serum formulated with copper tripeptides, niacinamide 10%, and encapsulated bakuchiol to restore barrier lipid synthesis and luminosity overnight.',
      price: 145.0,
      discount_price: 118.0,
      stock_qty: 42,
      sku: 'AUR-SKN-001',
      featured: 0,
      rating_avg: 4.9,
      rating_count: 2,
      sales_count: 310,
      images: [
        'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=1000&q=85',
        'https://images.unsplash.com/photo-1608248597359-0e6d526a6828?auto=format&fit=crop&w=1000&q=85',
      ],
      specs: {
        Volume: '50ml / 1.7 fl. oz. Violet Miron Glass',
        KeyActives: 'Copper Tripeptide-1, Bakuchiol, Hyaluronic Crosspolymer',
        SkinType: 'All Skin Profiles (Fragrance & Paraben Free)',
        Origin: 'Formulated in Geneva, Switzerland',
      },
    },
    {
      id: 'prd-009',
      category_id: 'cat-skincare',
      title: 'Obsidian Mineral Cryo-Recovery Facial Concentrate',
      slug: 'obsidian-mineral-cryo-recovery-facial-concentrate',
      description:
        'Volcanic thermal water concentrate infused with marine ectoin and ceramide NP complexes for immediate post-travel hydration and micro-barrier fortification.',
      price: 110.0,
      discount_price: null,
      stock_qty: 31,
      sku: 'AUR-SKN-002',
      featured: 0,
      rating_avg: 4.7,
      rating_count: 1,
      sales_count: 128,
      images: [
        'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=1000&q=85',
      ],
      specs: {
        Volume: '30ml / 1.0 fl. oz. Airless Pump',
        KeyActives: '2% Marine Ectoin, Ceramide NP/AP/EOP, Squalane',
        Certification: 'Dermatologically Tested, Cruelty-Free',
      },
    },
    {
      id: 'prd-010',
      category_id: 'cat-workspace',
      title: 'Valet Pro MagSafe Qi2 Solid Walnut & Titanium Dock',
      slug: 'valet-pro-magsafe-qi2-walnut-titanium-dock',
      description:
        '3-in-1 weighted charging pedestal carved from American black walnut and Grade 5 titanium rods, delivering 15W certified Qi2 fast wireless power to phone, watch, and earbuds.',
      price: 195.0,
      discount_price: 165.0,
      stock_qty: 22,
      sku: 'AUR-WRK-003',
      featured: 0,
      rating_avg: 4.8,
      rating_count: 1,
      sales_count: 195,
      images: [
        'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=1000&q=85',
      ],
      specs: {
        Output: '15W Qi2 Magnetic + 5W Watch Fast Charge + 5W Pad',
        BaseWeight: '1.1kg Non-Slip Micro-Suction Foot',
        Materials: 'FSC American Black Walnut & CNC Titanium',
      },
    },
  ];

  const insertProduct = db.prepare(`
    INSERT INTO products (
      id, category_id, title, slug, description, price, discount_price,
      stock_qty, sku, images, specs, featured, rating_avg, rating_count, sales_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const p of products) {
    insertProduct.run(
      p.id,
      p.category_id,
      p.title,
      p.slug,
      p.description,
      p.price,
      p.discount_price,
      p.stock_qty,
      p.sku,
      JSON.stringify(p.images),
      JSON.stringify(p.specs),
      p.featured,
      p.rating_avg,
      p.rating_count,
      p.sales_count
    );
  }

  // Sample Orders so Admin & Customer Dashboards have immediate rich telemetry
  const insertOrder = db.prepare(`
    INSERT INTO orders (
      id, user_id, order_number, subtotal_amount, tax_amount, shipping_fee,
      total_amount, payment_method, payment_status, order_status, shipping_address, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertOrderItem = db.prepare(`
    INSERT INTO order_items (
      id, order_id, product_id, product_name_snapshot, product_sku_snapshot,
      product_image_snapshot, unit_price_snapshot, quantity, subtotal
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Order 1: Delivered order for Marcus Sterling
  const ord1Id = 'ord-sample-0001';
  insertOrder.run(
    ord1Id,
    customerId,
    'ORD-20261118-8492',
    613.0,
    85.82,
    0.0,
    698.82,
    'Card',
    'paid',
    'delivered',
    JSON.stringify({
      fullName: 'Marcus Sterling',
      street: '450 Mercer Street, Apt 12B',
      city: 'New York',
      state: 'NY',
      postalCode: '10013',
      country: 'United States',
      phone: '+1 (555) 876-5432',
    }),
    'Leave with concierge at lobby desk.',
    '2026-11-18 14:22:10'
  );

  insertOrderItem.run(
    'oi-001',
    ord1Id,
    'prd-001',
    'AURA Sovereign Planar Wireless Headphones',
    'AUR-AUD-001',
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1000&q=85',
    495.0,
    1,
    495.0
  );
  insertOrderItem.run(
    'oi-002',
    ord1Id,
    'prd-008',
    'Cellular Nectar Bio-Peptide Night Repair Serum',
    'AUR-SKN-001',
    'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=1000&q=85',
    118.0,
    1,
    118.0
  );

  // Order 2: Shipped order for Layla Al-Mansoor
  const ord2Id = 'ord-sample-0002';
  insertOrder.run(
    ord2Id,
    vipCustomerId,
    'ORD-20261121-3910',
    1090.0,
    152.6,
    0.0,
    1242.6,
    'Card',
    'paid',
    'shipped',
    JSON.stringify({
      fullName: 'Layla Al-Mansoor',
      street: 'DIFC Gate Village 4, Penthouse 18',
      city: 'Dubai',
      state: 'Dubai',
      postalCode: '00000',
      country: 'UAE',
      phone: '+971 50 482 9103',
    }),
    'VIP Express Courier - Signature Required',
    '2026-11-21 19:05:44'
  );

  insertOrderItem.run(
    'oi-003',
    ord2Id,
    'prd-003',
    'Chronos V4 Titanium Automatic Chronograph',
    'AUR-HOR-001',
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1000&q=85',
    1090.0,
    1,
    1090.0
  );

  // Order 3: Processing order for Marcus Sterling
  const ord3Id = 'ord-sample-0003';
  insertOrder.run(
    ord3Id,
    customerId,
    'ORD-20261122-7741',
    365.0,
    51.1,
    0.0,
    416.1,
    'COD',
    'pending',
    'processing',
    JSON.stringify({
      fullName: 'Marcus Sterling',
      street: '450 Mercer Street, Apt 12B',
      city: 'New York',
      state: 'NY',
      postalCode: '10013',
      country: 'United States',
      phone: '+1 (555) 876-5432',
    }),
    '',
    '2026-11-22 11:30:00'
  );

  insertOrderItem.run(
    'oi-004',
    ord3Id,
    'prd-005',
    'Type-65 Custom CNC Gasket Mechanical Keyboard',
    'AUR-WRK-001',
    'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=1000&q=85',
    365.0,
    1,
    365.0
  );

  // Seed verified reviews
  const insertReview = db.prepare(`
    INSERT INTO reviews (id, user_id, product_id, rating, title, comment, is_verified_purchase, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertReview.run(
    'rev-001',
    customerId,
    'prd-001',
    5,
    'Unrivaled planar separation and titanium build',
    'The sub-bass extension and instrument separation rival my desktop studio monitors. The lambskin earpads stay cool even after 6-hour mastering sessions.',
    1,
    '2026-11-19 10:15:00'
  );

  insertReview.run(
    'rev-002',
    vipCustomerId,
    'prd-001',
    5,
    'Architectural luxury that actually performs',
    'Using the built-in USB-C DAC on flights is transformative. Zero background hiss and extraordinary machining quality.',
    1,
    '2026-11-20 16:40:00'
  );

  insertReview.run(
    'rev-003',
    vipCustomerId,
    'prd-003',
    5,
    'Finest titanium finishing under $5,000',
    'The bevel polishing on the skeleton bridges and the quick-micro-adjust clasp make this my daily timepiece.',
    1,
    '2026-11-22 09:12:00'
  );

  insertReview.run(
    'rev-004',
    customerId,
    'prd-008',
    5,
    'Visible overnight skin barrier recovery',
    'Noticeably calms redness and leaves a subtle glass-skin finish without heaviness. The Miron violet glass bottle feels substantial.',
    1,
    '2026-11-19 21:00:00'
  );
}

module.exports = { seedDatabase };
