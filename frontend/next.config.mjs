/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config) {
    // @metamask/sdk pulls in React Native packages that don't exist in browsers.
    // Stub them out so Next.js can compile wagmi connectors correctly.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': false,
      'react-native': false,
    }
    return config
  },
}

export default nextConfig
