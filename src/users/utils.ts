export const generateBetaUsername = () => {
  const randomString = Math.random().toString(36).substring(2, 8); // Generate random string of 6 characters
  const timestamp = Date.now(); // Get current timestamp in milliseconds
  return `beta_${randomString}_${timestamp}`; // Combine for a unique username
};
