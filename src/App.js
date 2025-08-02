import React, { useState, useEffect } from 'react';
import { 
  Sun, 
  Zap, 
  DollarSign, 
  TrendingUp, 
  Activity, 
  Settings,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  BarChart3,
  Calendar,
  Clock,
  User,
  Lock,
  LogOut,
  Eye,
  EyeOff
} from 'lucide-react';

// API Base URL - automatically detects environment
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? '' // Use relative URLs in production (same domain)
  : 'http://localhost:3001';

const HuaweiSolarApp = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [xsrfToken, setXsrfToken] = useState('');
  const [availablePlants, setAvailablePlants] = useState([]);
  const [selectedPlants, setSelectedPlants] = useState([]);
  const [realTimeData, setRealTimeData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Login form state
  const [credentials, setCredentials] = useState({
    userName: '',
    systemCode: ''
  });

  // Login function
  const handleLogin = async () => {
    setLoading(true);
    setLoginError('');
    
    try {
      console.log('Making login request to:', `${API_BASE_URL}/api/huawei/login`);
      
      // Call login API through proxy
      const response = await fetch(`${API_BASE_URL}/api/huawei/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials)
      });
      
      const data = await response.json();
      
      if (data.success === true) {
        // Get XSRF token from response (it should be in the response or headers)
        const token = data.xsrfToken || response.headers.get('xsrf-token');
        if (token) {
          setXsrfToken(token);
          // Fetch available plants
          await fetchStationList(token);
          setIsAuthenticated(true);
        } else {
          setLoginError('XSRF token not received. Please check API response.');
        }
      } else {
        setLoginError(data.message || 'Login failed. Please check your credentials.');
      }
    } catch (error) {
      console.error('Login error:', error);
      if (process.env.NODE_ENV === 'development') {
        setLoginError('Network error. Please check if the proxy server is running on port 3001.');
      } else {
        setLoginError('Network error. Please check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch station list
  const fetchStationList = async (token) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/huawei/getStationList`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          xsrfToken: token
        })
      });
      
      const data = await response.json();
      
      if (data.success === true && data.data) {
        const plants = data.data.map(station => ({
          code: station.stationCode, // Fixed: use stationCode instead of plantCode
          name: station.stationName, // Fixed: use stationName instead of plantName
          capacity: `${(station.capacity * 1000).toFixed(1)} kW` // Convert from MW to kW
        }));
        setAvailablePlants(plants);
        // Select all plants by default
        setSelectedPlants(plants.map(plant => plant.code));
        console.log('Plants loaded:', plants);
      }
    } catch (error) {
      console.error('Error fetching station list:', error);
    }
  };

  // Fetch real-time data with rate limiting protection
  const fetchRealTimeData = async () => {
    if (!xsrfToken || selectedPlants.length === 0) {
      console.log('Skipping fetch - no token or no plants selected');
      return;
    }
    
    setLoading(true);
    try {
      console.log('Fetching data for plants:', selectedPlants);
      
      const response = await fetch(`${API_BASE_URL}/api/huawei/getStationRealKpi`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          xsrfToken: xsrfToken,
          stationCodes: selectedPlants.join(',')
        })
      });
      
      const data = await response.json();
      console.log('Real-time data response:', data);
      
      if (data.success === true) {
        setRealTimeData(data.data || []);
        setLastUpdate(new Date());
        setLoginError(''); // Clear any previous errors
      } else {
        console.error('API Error:', data.message || data.failCode);
        
        // Handle specific error codes
        if (data.failCode === 407) {
          setLoginError('API rate limit exceeded. Please wait before refreshing.');
        } else if (data.failCode === 20010) {
          setLoginError('Invalid station codes. Please check your plant selection.');
        } else {
          setLoginError('Failed to fetch data. Please try again later.');
        }
        
        // Don't auto-logout for rate limiting errors
        if (data.failCode !== 407) {
          console.log('Session may have expired, but not logging out automatically');
        }
      }
    } catch (error) {
      console.error('Fetch error:', error);
      setLoginError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // Logout function
  const handleLogout = () => {
    setIsAuthenticated(false);
    setXsrfToken('');
    setAvailablePlants([]);
    setSelectedPlants([]);
    setRealTimeData([]);
    setCredentials({ userName: '', systemCode: '' });
    setLoginError('');
  };

  // Auto-refresh effect with longer intervals to avoid rate limiting
  useEffect(() => {
    if (isAuthenticated && selectedPlants.length > 0) {
      fetchRealTimeData();
      // Increased interval to 10 minutes to avoid rate limiting
      const interval = setInterval(fetchRealTimeData, 600000); // 10 minutes
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, selectedPlants]);

  const getHealthStatus = (state) => {
    switch (state) {
      case '1': return { icon: XCircle, color: 'text-red-500', text: 'Disconnected' };
      case '2': return { icon: AlertTriangle, color: 'text-yellow-500', text: 'Faulty' };
      case '3': return { icon: CheckCircle, color: 'text-green-500', text: 'Healthy' };
      default: return { icon: XCircle, color: 'text-gray-500', text: 'Unknown' };
    }
  };

  const calculateTotals = () => {
    return realTimeData.reduce((totals, plant) => {
      const data = plant.dataItemMap || {};
      return {
        totalDayPower: totals.totalDayPower + parseFloat(data.day_power || 0),
        totalRevenue: totals.totalRevenue + parseFloat(data.day_income || 0),
        totalMonthPower: totals.totalMonthPower + parseFloat(data.month_power || 0),
        totalLifetimePower: totals.totalLifetimePower + parseFloat(data.total_power || 0),
        totalOnGridEnergy: totals.totalOnGridEnergy + parseFloat(data.day_on_grid_energy || 0)
      };
    }, {
      totalDayPower: 0,
      totalRevenue: 0,
      totalMonthPower: 0,
      totalLifetimePower: 0,
      totalOnGridEnergy: 0
    });
  };

  const handlePlantSelection = (plantCode) => {
    setSelectedPlants(prev => 
      prev.includes(plantCode) 
        ? prev.filter(code => code !== plantCode)
        : [...prev, plantCode]
    );
  };

  // Login Page Component
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-blue-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sun className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Solar Dashboard</h1>
            <p className="text-gray-500 mt-2">Sign in to your Huawei FusionSolar account</p>
          </div>

          {loginError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
              <div className="flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2" />
                <span className="text-sm">{loginError}</span>
              </div>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="w-4 h-4 inline mr-2" />
                Username
              </label>
              <input
                type="text"
                required
                value={credentials.userName}
                onChange={(e) => setCredentials(prev => ({ ...prev, userName: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                placeholder="Enter your username (e.g., NeelPriyantha2)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Lock className="w-4 h-4 inline mr-2" />
                System Code
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={credentials.systemCode}
                  onChange={(e) => setCredentials(prev => ({ ...prev, systemCode: e.target.value }))}
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                  placeholder="Enter your system code (e.g., Maharagama5325)"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Your system code acts as your password
              </p>
            </div>

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              {process.env.NODE_ENV === 'development' 
                ? "Make sure your proxy server is running on port 3001"
                : "Secure connection to Huawei FusionSolar"
              }
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard Component (when authenticated)
  const totals = calculateTotals();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center">
                <Sun className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Solar Energy Solutions</h1>
                <p className="text-sm text-gray-500">Powered by Huawei FusionSolar</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-500">
                <div className="flex items-center space-x-1">
                  <Clock className="w-4 h-4" />
                  <span>Last update: {lastUpdate.toLocaleTimeString()}</span>
                </div>
              </div>
              <button
                onClick={fetchRealTimeData}
                disabled={loading}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={handleLogout}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                <LogOut className="w-4 h-4 mr-1" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Error Display */}
        {loginError && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg mb-6">
            <div className="flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2" />
              <span className="text-sm">{loginError}</span>
            </div>
          </div>
        )}

        {/* Plant Selection */}
        {availablePlants.length > 0 && (
          <div className="bg-white rounded-lg shadow mb-6 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Settings className="w-5 h-5 mr-2" />
              Select Plants to Monitor
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {availablePlants.map((plant) => (
                <label key={plant.code} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPlants.includes(plant.code)}
                    onChange={() => handlePlantSelection(plant.code)}
                    className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{plant.name}</div>
                    <div className="text-xs text-gray-500">{plant.capacity}</div>
                    <div className="text-xs text-gray-400">{plant.code}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Zap className="h-8 w-8 text-yellow-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Today's Generation</dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {totals.totalDayPower.toFixed(2)} kWh
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DollarSign className="h-8 w-8 text-green-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Today's Revenue</dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    ${totals.totalRevenue.toFixed(2)}
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Calendar className="h-8 w-8 text-blue-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">This Month</dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {totals.totalMonthPower.toFixed(2)} kWh
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <TrendingUp className="h-8 w-8 text-purple-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Lifetime</dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {(totals.totalLifetimePower / 1000).toFixed(1)} MWh
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        {/* Plant Details */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <BarChart3 className="w-5 h-5 mr-2" />
              Plant Performance Details
            </h2>
          </div>
          <div className="p-6">
            {realTimeData.length === 0 ? (
              <div className="text-center py-12">
                <Sun className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">
                  {selectedPlants.length === 0 
                    ? "Please select plants to monitor from the selection above."
                    : "Loading plant data..."
                  }
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {realTimeData.map((plant, index) => {
                  const plantInfo = availablePlants.find(p => p.code === plant.stationCode);
                  const healthStatus = getHealthStatus(plant.dataItemMap?.real_health_state);
                  const HealthIcon = healthStatus.icon;
                  
                  return (
                    <div key={`${plant.stationCode}-${index}`} className="border border-gray-200 rounded-lg p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-medium text-gray-900">
                            {plantInfo?.name || plant.stationCode}
                          </h3>
                          <p className="text-sm text-gray-500">{plantInfo?.capacity}</p>
                        </div>
                        <div className="flex items-center space-x-1">
                          <HealthIcon className={`w-5 h-5 ${healthStatus.color}`} />
                          <span className={`text-sm ${healthStatus.color}`}>
                            {healthStatus.text}
                          </span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 p-3 rounded">
                          <div className="text-xs text-gray-500 uppercase tracking-wide">Daily Power</div>
                          <div className="text-lg font-semibold text-gray-900">
                            {parseFloat(plant.dataItemMap?.day_power || 0).toFixed(2)} kWh
                          </div>
                        </div>
                        
                        <div className="bg-gray-50 p-3 rounded">
                          <div className="text-xs text-gray-500 uppercase tracking-wide">Daily Revenue</div>
                          <div className="text-lg font-semibold text-gray-900">
                            ${parseFloat(plant.dataItemMap?.day_income || 0).toFixed(2)}
                          </div>
                        </div>
                        
                        <div className="bg-gray-50 p-3 rounded">
                          <div className="text-xs text-gray-500 uppercase tracking-wide">Grid Export</div>
                          <div className="text-lg font-semibold text-gray-900">
                            {parseFloat(plant.dataItemMap?.day_on_grid_energy || 0).toFixed(2)} kWh
                          </div>
                        </div>
                        
                        <div className="bg-gray-50 p-3 rounded">
                          <div className="text-xs text-gray-500 uppercase tracking-wide">Consumption</div>
                          <div className="text-lg font-semibold text-gray-900">
                            {parseFloat(plant.dataItemMap?.day_use_energy || 0).toFixed(2)} kWh
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Total Lifetime Generation:</span>
                          <span className="font-medium text-gray-900">
                            {(parseFloat(plant.dataItemMap?.total_power || 0) / 1000).toFixed(1)} MWh
                          </span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                          <span className="text-gray-500">Total Revenue:</span>
                          <span className="font-medium text-gray-900">
                            ${parseFloat(plant.dataItemMap?.total_income || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HuaweiSolarApp;