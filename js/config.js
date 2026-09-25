const SUPABASE_URL = "https://delaoxulbzorialwaiqz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlbGFveHVsYnpvcmlhbHdhaXF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNDQ4MzIsImV4cCI6MjEwMzkyMDgzMn0.XKp-Kuh1KPn9xlwCCxa_DGwZ3Xogh5ScAB2adRpu2tg";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const PRODUCT = {
  name: "Microfiber All Purpose Cloth",
  price: 99,
  colors: ["Light Brown", "Dusty Pink", "Slate Blue"],
  size: "60 × 40 cm",
  gsm: "300 GSM",
  image: "./assets/microfiber-cloth.jpg"
};
