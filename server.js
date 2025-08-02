const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS - updated for production
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [process.env.FRONTEND_URL] // Railway will provide this automatically
  : ['http://localhost:3000', 'http://localhost:3001'];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (process.env.NODE_ENV === 'production') {
      // In production, allow the railway domain
      if (origin.includes('railway.app') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    } else {
      // In development, be more permissive
      return callback(null, true);
    }
  },
  credentials: true
}));

app.use(express.json());

// Serve static files from the React app build directory (for production)
if (process.env.NODE_ENV === 'production') {
  console.log('Serving static files from build directory');
  app.use(express.static(path.join(__dirname, 'build')));
}

// Add logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  if (req.method === 'POST' && !req.path.includes('login')) {
    console.log('Request body:', req.body);
  }
  next();
});

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    port: PORT
  });
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({ 
    message: 'Proxy server is working!',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Login endpoint - special case
app.post('/api/huawei/login', async (req, res) => {
  try {
    const { userName, systemCode } = req.body;
    
    console.log('Login attempt for user:', userName);
    
    if (!userName || !systemCode) {
      return res.status(400).json({ 
        success: false,
        error: 'Username and system code are required' 
      });
    }
    
    const apiUrl = 'https://intl.fusionsolar.huawei.com/thirdData/login';
    console.log('Making login request to:', apiUrl);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Solar-Monitor-App/1.0'
      },
      body: JSON.stringify({
        userName,
        systemCode
      })
    });
    
    console.log('Login API Response status:', response.status);
    
    if (!response.ok) {
      console.error('Login API responded with error:', response.status, response.statusText);
      return res.status(response.status).json({ 
        success: false,
        error: `Login API error: ${response.status} ${response.statusText}` 
      });
    }
    
    const data = await response.json();
    console.log('Login API Response success:', data.success);
    
    // Extract XSRF token from response headers
    const xsrfToken = response.headers.get('xsrf-token') || 
                      response.headers.get('XSRF-TOKEN') ||
                      response.headers.get('X-XSRF-TOKEN');
    
    // Add the XSRF token to the response data
    if (xsrfToken) {
      data.xsrfToken = xsrfToken;
      console.log('XSRF Token extracted successfully');
    } else {
      console.warn('No XSRF token found in response headers');
      // Log all headers for debugging
      console.log('Available headers:', Object.fromEntries(response.headers.entries()));
    }
    
    res.json(data);
    
  } catch (error) {
    console.error('Login proxy error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Login proxy server error', 
      details: error.message 
    });
  }
});

// Generic Huawei API proxy endpoint for other endpoints
app.post('/api/huawei/:endpoint', async (req, res) => {
  try {
    const { endpoint } = req.params;
    const { xsrfToken, ...body } = req.body;
    
    console.log('Endpoint:', endpoint);
    console.log('XSRF Token:', xsrfToken ? 'Present' : 'Missing');
    console.log('Request body:', body);
    
    if (!xsrfToken) {
      return res.status(400).json({ 
        success: false,
        error: 'XSRF token is required' 
      });
    }
    
    // Validate stationCodes for getStationRealKpi
    if (endpoint === 'getStationRealKpi') {
      if (!body.stationCodes || body.stationCodes.trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'stationCodes parameter is required and cannot be empty'
        });
      }
      console.log('Station codes to query:', body.stationCodes);
    }
    
    const apiUrl = `https://intl.fusionsolar.huawei.com/thirdData/${endpoint}`;
    console.log('Making request to:', apiUrl);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'XSRF-TOKEN': xsrfToken,
        'User-Agent': 'Solar-Monitor-App/1.0'
      },
      body: JSON.stringify(body)
    });
    
    console.log('API Response status:', response.status);
    
    if (!response.ok) {
      console.error('API responded with error:', response.status, response.statusText);
      return res.status(response.status).json({ 
        success: false,
        error: `API error: ${response.status} ${response.statusText}` 
      });
    }
    
    const data = await response.json();
    console.log('API Response success:', data.success);
    
    // Handle specific API error cases
    if (!data.success) {
      if (data.failCode === 407) {
        console.warn('Rate limit hit - ACCESS_FREQUENCY_IS_TOO_HIGH');
      } else if (data.failCode === 20010) {
        console.warn('Invalid station codes provided');
      }
    }
    
    res.json(data);
    
  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Proxy server error', 
      details: error.message 
    });
  }
});

// Catch all handler: send back React's index.html file for any non-API routes
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'build', 'index.html');
    console.log('Serving index.html from:', indexPath);
    res.sendFile(indexPath);
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/test`);
  console.log('📡 Available API endpoints:');
  console.log('  POST /api/huawei/login - Login to Huawei FusionSolar');
  console.log('  POST /api/huawei/getStationList - Get list of solar plants');
  console.log('  POST /api/huawei/getStationRealKpi - Get real-time plant data');
  
  if (process.env.NODE_ENV === 'production') {
    console.log('🌐 Serving React app from /build directory');
  }
});