-- Centralized public contact settings for Saleh.design
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO site_settings (key, value)
VALUES (
  'contact',
  '{"phone":"050 570 0462","whatsapp":"966505700462","location":"BURYDAH · KSA","website":"SALEH.DESIGN","instagram":"https://www.instagram.com/7_xs?stkn=MWZqbmV1dXh0YzV4Yw%3D%3D&utm_source=qr","snapchat":"https://snapchat.com/t/V5O0yWH0","email":""}'
)
ON CONFLICT(key) DO NOTHING;
