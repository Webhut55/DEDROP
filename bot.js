import puppeteer from 'puppeteer';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, update } from 'firebase/database';
import fs from 'fs';

// 1. Firebase Configuration
const firebaseConfig = {
    databaseURL: "https://dedrop-store-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 2. Helper to Load DeoDap Cookies
async function loadCookies(page) {
    try {
        const cookieString = fs.readFileSync('./deodap.in.cookies.json', 'utf8');
        const cookies = JSON.parse(cookieString);
        await page.setCookie(...cookies);
        console.log("DeoDap session cookies loaded successfully.");
    } catch (err) {
        console.log("No existing cookies found or failed to load them:", err.message);
    }
}

// 3. Main Automation Logic
async function fulfillOrders() {
    console.log("Fetching pending orders from Firebase...");
    const ordersRef = ref(db, 'orders');
    const snapshot = await get(ordersRef);

    if (!snapshot.exists()) {
        console.log("No orders found in database.");
        return;
    }

    const orders = snapshot.val();
    
    // Launch Headless Browser for GitHub Actions compatibility
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    for (const id in orders) {
        const order = orders[id];

        // Process only orders that are marked Verified but not yet processed by supplier
        if (order.status === 'Verified' && !order.supplierProcessed) {
            console.log(`Processing Order ID: ${id} for product: ${order.productName || id}`);

            try {
                // Navigate to DeoDap and inject auth session
                await page.goto('https://deodap.in', { waitUntil: 'networkidle2' });
                await loadCookies(page);
                await page.reload({ waitUntil: 'networkidle2' });

                if (order.productUrl) {
                    await page.goto(order.productUrl, { waitUntil: 'networkidle2' });
                } else {
                    console.log(`Missing product URL for order ${id}, skipping...`);
                    continue;
                }

                // Click "Buy Now" or "Add to Cart"
                const buyNowSelector = 'button[name="add"], .product-form__submit, #BuyNow'; 
                await page.waitForSelector(buyNowSelector, { timeout: 5000 });
                await page.click(buyNowSelector);
                await page.waitForNavigation({ waitUntil: 'networkidle2' });

                // Fill in customer shipping details at checkout page
                await page.waitForSelector('input[name="checkout[shipping_address][first_name]"]', { timeout: 5000 });
                await page.type('input[name="checkout[shipping_address][first_name]"]', order.customerName || '');
                await page.type('input[name="checkout[shipping_address][address1]"]', order.address || '');
                await page.type('input[name="checkout[shipping_address][city]"]', order.city || '');
                await page.type('input[name="checkout[shipping_address][zip]"]', order.zipCode || '');
                await page.type('input[name="checkout[shipping_address][phone]"]', order.phone || '');

                console.log(`Fulfillment steps simulated successfully for Order ${id}`);

                // Update Firebase status so it doesn't process again
                await update(ref(db, `orders/${id}`), {
                    supplierProcessed: true,
                    status: 'Processing'
                });
                console.log(`Order ${id} marked as Processing in Firebase.`);

            } catch (error) {
                console.error(`Failed to process order ${id}:`, error.message);
            }
        }
    }

    await browser.close();
    console.log("Automation run complete.");
    process.exit(0);
}

// Execute logic
fulfillOrders().catch(err => {
    console.error("Critical automation failure:", err);
    process.exit(1);
});