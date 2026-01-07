-- Seed Categories
INSERT INTO categories (name, pos_id) VALUES
  ('Beverages', '00000000-0000-0000-0000-000000000000'),
  ('Snacks', '00000000-0000-0000-0000-000000000000'),
  ('Grains & Cereals', '00000000-0000-0000-0000-000000000000'),
  ('Dairy', '00000000-0000-0000-0000-000000000000'),
  ('Household', '00000000-0000-0000-0000-000000000000'),
  ('Personal Care', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (name) DO NOTHING;

-- Seed Sample Products
INSERT INTO products (name, barcode, selling_price, cost_price, stock_level, unit_type, low_stock_threshold, notify_low_stock, category_id, pos_id)
VALUES
  -- Quantity Items
  ('Coca Cola 500ml', '5449000000996', 2.50, 1.50, 100, 'QUANTITY', 20, TRUE, (SELECT id FROM categories WHERE name = 'Beverages'), '00000000-0000-0000-0000-000000000000'),
  ('Pepsi 500ml', '012000161155', 2.50, 1.50, 80, 'QUANTITY', 20, TRUE, (SELECT id FROM categories WHERE name = 'Beverages'), '00000000-0000-0000-0000-000000000000'),
  ('Lays Chips', '028400000000', 1.99, 1.20, 150, 'QUANTITY', 30, TRUE, (SELECT id FROM categories WHERE name = 'Snacks'), '00000000-0000-0000-0000-000000000000'),
  ('Oreo Cookies', '044000032319', 3.49, 2.00, 60, 'QUANTITY', 15, TRUE, (SELECT id FROM categories WHERE name = 'Snacks'), '00000000-0000-0000-0000-000000000000'),
  ('Milk 1L', '041303001646', 3.99, 2.50, 40, 'QUANTITY', 10, TRUE, (SELECT id FROM categories WHERE name = 'Dairy'), '00000000-0000-0000-0000-000000000000'),
  ('Butter 250g', '041303026977', 4.99, 3.00, 25, 'QUANTITY', 5, TRUE, (SELECT id FROM categories WHERE name = 'Dairy'), '00000000-0000-0000-0000-000000000000'),
  ('Dish Soap', '037000274667', 2.99, 1.80, 50, 'QUANTITY', 10, TRUE, (SELECT id FROM categories WHERE name = 'Household'), '00000000-0000-0000-0000-000000000000'),
  ('Shampoo 400ml', '037000274698', 6.99, 4.20, 35, 'QUANTITY', 8, TRUE, (SELECT id FROM categories WHERE name = 'Personal Care'), '00000000-0000-0000-0000-000000000000'),
  
  -- Weight Items
  ('White Rice', 'RICE001', 1.99, 1.20, 500.000, 'WEIGHT', 50.000, TRUE, (SELECT id FROM categories WHERE name = 'Grains & Cereals'), '00000000-0000-0000-0000-000000000000'),
  ('Brown Sugar', 'SUGAR001', 1.49, 0.90, 300.000, 'WEIGHT', 30.000, TRUE, (SELECT id FROM categories WHERE name = 'Grains & Cereals'), '00000000-0000-0000-0000-000000000000'),
  ('All-Purpose Flour', 'FLOUR001', 0.99, 0.60, 400.000, 'WEIGHT', 40.000, TRUE, (SELECT id FROM categories WHERE name = 'Grains & Cereals'), '00000000-0000-0000-0000-000000000000'),
  ('Kidney Beans', 'BEANS001', 2.49, 1.50, 200.000, 'WEIGHT', 25.000, TRUE, (SELECT id FROM categories WHERE name = 'Grains & Cereals'), '00000000-0000-0000-0000-000000000000')
ON CONFLICT (barcode) DO NOTHING;
