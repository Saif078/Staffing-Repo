const https = require('https');

function httpsPost(options, bodyString) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(bodyString);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY is not set on Vercel. Go to Settings → Environment Variables, add it, then Redeploy.'
    });
  }

  // Safely read + parse the request body
  let body;
  try {
    if (typeof req.body === 'object' && req.body !== null) {
      body = req.body;
    } else {
      const raw = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });
      body = JSON.parse(raw);
    }
  } catch (err) {
    return res.status(400).json({ error: 'Could not parse request body: ' + err.message });
  }

  const bodyString = JSON.stringify(body);

  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyString),
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  };

  try {
    const { status, body: rawText } = await httpsPost(options, bodyString);

    if (!rawText || rawText.trim() === '') {
      return res.status(500).json({ error: 'Anthropic returned an empty response.' });
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({ error: 'Anthropic response was not valid JSON: ' + rawText.substring(0, 300) });
    }

    if (status !== 200) {
      return res.status(status).json({
        error: data?.error?.message || `Anthropic API error (HTTP ${status})`
      });
    }

    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: 'Failed to contact Anthropic: ' + err.message });
  }
};
