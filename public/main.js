// === main.js - The Single Entry Point for the Application ===

// This file is the new heart of your application's frontend.
// It imports the core logic, network functions, and UI functions
// in the correct order to ensure everything is available when needed.

// Import Core logic first: state management, batching, auto-refresh
import './notam-core.js';

// Import Network logic: the function to fetch data from your API
import './notam-network.js';

// Import UI logic last: all rendering functions and event listeners
import './notam-ui.js';
