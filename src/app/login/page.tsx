"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
      } else {
        setSuccess("Login successful!");
      }
    } catch (err) {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-9 min-h-screen w-full flex bg-white">
      {/* Left: Login Form */}
      <div className="col-span-4 justify-center flex flex-col p-16 bg-white animate-fade-in-left">
        <div className="flex flex-col items-center justify-center text-center">
          <a href="/">
            <img src="/LakuLakuIcon.svg" alt="Laku-Laku Logo" className="h-15 mb-4" />
          </a>
          <h2 className="text-3xl text-black font-bold mb-2">Welcome Back</h2>
          <p className="mb-8 text-gray-500">Enter your email and password to access your account.</p>
        </div>
        <form className="space-y-4" onSubmit={handleLogin}>
          <div>
            <label className="block mb-1 text-sm text-gray-500">Email</label>
            <input
              type="email"
              className="w-full px-4 py-2 text-black border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="you@email.com"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block mb-1 text-sm text-gray-500">Password</label>
            <input
              type="password"
              className="w-full px-4 py-2 text-black border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="Password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center">
              <input type="checkbox" className="mr-1 " />
              <span className="text-sm text-gray-500">Remember Me</span>
            </label>
            <a href="/forgotpassword" className="text-sm text-[#0a61d7] hover:underline">Forgot Password?</a>
          </div>
          {error && <p className="text-red-500 mt-2 text-sm">{error}</p>}
          {success && <p className="text-green-600 mt-2 text-sm">{success}</p>}
          <button
            type="submit"
            className="w-full py-3 bg-[#0a61d7] text-white rounded-lg font-semibold hover:bg-[#084ba6] transition text-sm disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Log In"}
          </button>
        </form>
        <div className="my-6 flex items-center">
          <div className="flex-grow h-px bg-gray-200" />
          <span className="mx-4 text-gray-400 text-sm">Or Login With</span>
          <div className="flex-grow h-px bg-gray-200" />
        </div>
        <div className="flex space-x-4">
          <button className="flex-1 py-2 text-gray-500 border border-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-50">
            <img src="/google.svg" alt="Google" className="h-5 w-5 mr-2" /> Google
          </button>
          <button className="flex-1 py-2 text-gray-500 border border-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-50">
            <img src="/apple.svg" alt="Apple" className="h-5 w-4 mr-2" /> Apple
          </button>
        </div>
        <p className="mt-8 text-center text-sm text-gray-500">
          Don&apos;t have an account? <a href="/register" className="l-2 text-[#0a61d7] font-semibold hover:underline">Register Now</a>
        </p>
      </div>
      {/* Right: Placeholder for Distribution/Retailing Image */}
      <div className="col-span-5 bg-blue-600 flex items-center justify-center animate-fade-in-right">
        <span className="text-white text-2xl font-bold">[Distribution/Retailing Image Placeholder]</span>
      </div>
    </div>
  );
}
