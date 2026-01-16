import { test, expect } from '@playwright/test';

test.describe('POS & Inventory E2E', () => {
  // Mock Data
  const mockProductA = {
    id: 'prod-a',
    name: 'Product A',
    barcode: '111111',
    selling_price: 50.00,
    stock_level: 10,
    unit_type: 'QUANTITY',
    category_id: 'cat-1',
    tax_category: 'VATABLE',
    supplier_type: 'WHOLESALER',
    is_low_stock: false,
    low_stock_threshold: 5,
    notify_low_stock: true,
  };

  const mockProductB = { // New Product
    id: 'prod-b',
    name: 'Product B',
    barcode: '222222',
    selling_price: 0,
    stock_level: 0,
    unit_type: 'QUANTITY',
    tax_category: 'VATABLE',
  };

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));
    
    // Mock APIs
    await page.route('*/**/api/products?search=111111', async route => {
        await route.fulfill({ json: [mockProductA] });
    });

    await page.route('*/**/api/products?search=222222', async route => {
        await route.fulfill({ json: [] }); // Not found
    });

    // Mock Barcode API (used by ProductSearch)
    await page.route('*/**/api/products/barcode/111111', async route => {
        await route.fulfill({ json: mockProductA });
    });

    await page.route('*/**/api/shifts/current', async route => {
        await route.fulfill({ json: { id: 'shift-1', status: 'OPEN' } });
    });

    await page.route('*/**/api/settings', async route => {
        await route.fulfill({ json: { auto_print: 'false' } });
    });

    await page.route('*/**/api/transactions', async route => {
        await route.fulfill({ json: { invoice_number: 'INV-001', net_sales: 50.00 } });
    });

    // Seed LocalStorage with Terminal ID
    await page.addInitScript(() => {
        localStorage.setItem('pos_terminal_id', 'term-1');
    });
  });

  const scanBarcode = async (page: any, barcode: string) => {
      await page.evaluate((code: string) => {
          const createEvent = (type: string, key: string) => new KeyboardEvent(type, { key, bubbles: true });
          
          // Mock time gap
          let now = Date.now();
          const originalDateNow = Date.now;
          Date.now = () => now;
          
          code.split('').forEach(char => {
              window.dispatchEvent(createEvent('keydown', char));
              window.dispatchEvent(createEvent('keypress', char));
              window.dispatchEvent(createEvent('input', char));
              now += 10;
          });
          window.dispatchEvent(createEvent('keydown', 'Enter'));
          window.dispatchEvent(createEvent('keypress', 'Enter'));
          Date.now = originalDateNow;
      }, barcode);
  };

  test('Scenario: The "Shift" Check', async ({ page }) => {
    await page.goto('/pos');

    // Wait for Splash Screen to disappear
    await expect(page.getByText('General Store POS')).toBeHidden({ timeout: 10000 });

    // Click body to unfocus search input (so GlobalScanHandler can pick it up)
    await page.locator('body').click();

    // Simulate Scan Barcode A
    await scanBarcode(page, '111111');
    
    // Wait for processing
    await page.waitForTimeout(1000);

    // Debug: Check if item added
    const emptyCart = await page.getByText('Cart is empty').isVisible();
    if (emptyCart) {
        console.log('Cart is empty after scan. Scan failed.');
    }

    // Check UI: Total is 50.00
    // Use layout relationship: TOTAL DUE is adjacent to the price in the same container
    const totalLabel = page.getByText('TOTAL DUE');
    await expect(totalLabel).toBeVisible();
    await expect(totalLabel.locator('xpath=..')).toContainText('50.00');

    // Stability wait
    await page.waitForTimeout(500);

    // Ensure Cash is selected
    await page.getByText('Cash', { exact: true }).click();

    // Debug: Ensure input is visible
    await expect(page.locator('#tendered')).toBeVisible();

    // Click Exact Amount - using force in case of layout shifts or size issues
    await page.getByRole('button', { name: /exact amount/i }).click({ force: true });
    await page.getByRole('button', { name: /finish cash/i }).click();

    // Verify Success Toast
    await expect(page.getByText('Transaction INV-001 completed!')).toBeVisible();
  });

  test('Scenario: The "Ghost" Scan (Safety)', async ({ page }) => {
    await page.goto('/inventory');

    // 1. Scan Barcode B (New Item)
    await scanBarcode(page, '222222');

    // Verify Add Product Modal
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Add New Product' })).toBeVisible();
    
    // Check barcode field is pre-filled
    const barcodeInput = page.locator('input[name="barcode"]');
    await expect(barcodeInput).toHaveValue('222222');

    // Critical Check: Stock Level input should be Enabled for new product
    const stockInput = page.locator('input[name="stock_level"]');
    await expect(stockInput).toBeEnabled();

    // Close modal
    await page.getByRole('button', { name: 'Cancel' }).click();

    // 2. Scan Barcode A (Existing Item)
    await scanBarcode(page, '111111');

    // Verify Restock Modal
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Quick Restock' })).toBeVisible();
    
    // Critical Check: Price should NOT be visible/editable in Quick Restock
    // (Assuming Quick Restock only has Quantity input)
    await expect(page.locator('input[name="selling_price"]')).not.toBeVisible();
    
    // Check Header info
    await expect(page.getByText('Product A')).toBeVisible();
    await expect(page.getByText('Current Stock: 10')).toBeVisible();
  });
});
