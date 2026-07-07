// api/keep-alive.js
// Dipanggil oleh Vercel Cron setiap beberapa hari untuk "sentuh" Supabase
// supaya project tak auto-pause (free tier pause lepas 7 hari tanpa aktiviti).

export default async function handler(req, res) {
  try {
    const url = `${process.env.SUPABASE_URL || 'https://hilbieedrztgxqmuiuec.supabase.co'}/rest/v1/settings?select=id&limit=1`;

    const response = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`
      }
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Keep-alive gagal:', response.status, text);
      return res.status(500).json({ ok: false, status: response.status });
    }

    const data = await response.json();
    return res.status(200).json({ ok: true, checkedAt: new Date().toISOString(), rows: data.length });
  } catch (err) {
    console.error('Keep-alive error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
