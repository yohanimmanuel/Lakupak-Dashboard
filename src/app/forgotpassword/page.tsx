"use client";
import React, { useState } from "react";

function validatePassword(pw: string) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/.test(pw);
}

export default function ForgotPasswordPage() {
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!email) {
      setError("Please enter your registered email.");
      return;
    }
    // Here you would trigger the backend to send a reset code or verify email
    setStep(1);
  }

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!validatePassword(password)) {
      setError(
        "Password must be at least 8 characters, include uppercase, lowercase, number, and special character."
      );
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    // Here you would trigger the backend to update the password
    setSuccess("Password has been reset successfully.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-md p-8 rounded-lg">
        {step === 0 && (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="flex flex-col items-center justify-center text-center mb-8">
              <a href="/">
                <img src="/LakuLakuTextLogo.svg" alt="Laku-Laku Logo" className="h-10" />
              </a>
            </div>
            <h2 className="text-2xl font-bold text-center text-black mb-4">Forgot Password</h2>
            <p className="text-center text-gray-500 text-sm mb-10">
              Enter your registered email address and press 'Send'. We will send you a link to set a new password if the email is found in our system.
            </p>
            <div>
              <label className="block mb-1 text-sm text-gray-500">Registered Email</label>
              <input
                type="email"
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-black"
                placeholder="you@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            {success && <p className="text-green-600 text-sm mt-2">{success}</p>}
            <button
              type="submit"
              className="w-full py-3 bg-[#0a61d7] text-white rounded-lg font-semibold hover:bg-[#084ba6] transition text-sm"
            >
              Send
            </button>
          </form>
        )}
        {step === 1 && (
          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <div className="flex flex-col items-center justify-center text-center mb-8">
              <a href="/">
                <img src="/LakuLakuTextLogo.svg" alt="Laku-Laku Logo" className="h-10" />
              </a>
            </div>
            <h2 className="text-2xl font-bold text-center text-black mb-4">Set New Password</h2>
            <p className="text-center text-gray-500 text-sm mb-10">
              Enter your new password and confirm it to reset your account.
            </p>
            <div>
              <label className="block mb-1 text-sm text-gray-500">New Password</label>
              <input
                type="password"
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-black"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block mb-1 text-sm text-gray-500">Confirm Password</label>
              <input
                type="password"
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-black"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            {success && <p className="text-green-600 text-sm mt-2">{success}</p>}
            <button
              type="submit"
              className="w-full py-3 bg-[#0a61d7] text-white rounded-lg font-semibold hover:bg-[#084ba6] transition text-sm"
            >
              Reset Password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
