const https = require('https');
const http = require('http');

exports.resolveUrl = async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const resolve = (url) => {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      client.get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          resolve(response.headers.location);
        } else {
          resolve(url); // No redirect, return original (or final)
        }
      }).on('error', reject);
    });
  };

  try {
    // Seguir hasta 5 redirecciones
    let currentUrl = url;
    for (let i = 0; i < 5; i++) {
      const nextUrl = await resolve(currentUrl);
      if (nextUrl === currentUrl) break;
      currentUrl = nextUrl;
    }
    res.json({ url: currentUrl });
  } catch (error) {
    console.error('Error resolving URL:', error);
    res.status(500).json({ error: 'Error resolving URL' });
  }
};