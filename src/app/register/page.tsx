"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useUserStore } from '@/store/userStore';

const steps = ["User Info", "Company Info", "Set Password"];

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex justify-center mb-8">
      {steps.map((label, idx) => (
        <div key={label} className="flex items-center">
          <div
            className={`rounded-full w-8 h-8 flex items-center justify-center font-bold text-white ${
              step === idx
                ? "bg-[#0a61d7]"
                : step > idx
                ? "bg-green-500"
                : "bg-gray-300"
            }`}
          >
            {idx + 1}
          </div>
          {idx < steps.length - 1 && (
            <div className="w-8 h-1 bg-gray-300 mx-2" />
          )}
        </div>
      ))}
    </div>
  );
}

export default function RegisterPage() {
  const [step, setStep] = useState(0);
  const [userInfo, setUserInfo] = useState({ firstName: "", lastName: "", email: "" });
  const [companyInfo, setCompanyInfo] = useState({ company: "", address: "" });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [stepKey, setStepKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const router = useRouter();
  const setUser = useUserStore(state => state.setUser);

  function validatePassword(pw: string) {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/.test(pw);
  }

  async function handleNext(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (step === 0) {
      if (!userInfo.firstName || !userInfo.lastName || !userInfo.email) {
        setError("Please fill all fields.");
        return;
      }
    }
    if (step === 1) {
      if (!companyInfo.company || !companyInfo.address) {
        setError("Please fill all fields.");
        return;
      }
    }
    if (step === 2) {
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
      // Submit registration to backend
      setLoading(true);
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: userInfo.firstName,
            lastName: userInfo.lastName,
            email: userInfo.email,
            password,
            company: companyInfo.company,
            address: companyInfo.address,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Registration failed");
        } else {
          setSuccess("Registration successful! Redirecting to dashboard...");
          setUser({
            id: data.id,
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            company: data.company,
            address: data.address,
          });
          router.push("/home");
        }
      } catch (err) {
        setError("Registration failed. Please try again.");
      } finally {
        setLoading(false);
      }
      return;
    }
    if (step < 2) {
      setStep(step + 1);
      setStepKey(prev => prev + 1);
    }
  }

  function handleBack() {
    if (step > 0) {
      setStep(step - 1);
      setStepKey(prev => prev + 1);
      setError(""); // Clear error when going back
    }
  }

  return (
    <div className="grid grid-cols-9 min-h-screen w-full flex bg-white">
      {/* Left: Registration Form */}
      <div className="col-span-4 flex flex-col justify-center p-16 bg-white animate-fade-in-left">
        <div>
          <a href="/">
            <img src="/LakuLakuTextLogo.svg" alt="Laku-Laku Logo" className="h-13 mb-4" />
          </a>
        </div>
        <h2 className="text-3xl text-black font-bold mb-2">Create Distributor Account</h2>
        <p className="mb-8 text-gray-500">Register your distributor account in three easy steps.</p>
        <Stepper step={step} />
        <form onSubmit={handleNext}>
          <div key={stepKey} className="animate-fade-in-up">
            {step === 0 && (
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="w-1/2">
                    <label className="block mb-1 text-sm text-gray-500">First Name</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-black"
                      value={userInfo.firstName}
                      onChange={e => setUserInfo({ ...userInfo, firstName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="w-1/2">
                    <label className="block mb-1 text-sm text-gray-500">Last Name</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-black"
                      value={userInfo.lastName}
                      onChange={e => setUserInfo({ ...userInfo, lastName: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block mb-1 text-sm text-gray-500">Email</label>
                  <input
                    type="email"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-black"
                    value={userInfo.email}
                    onChange={e => setUserInfo({ ...userInfo, email: e.target.value })}
                    required
                  />
                </div>
              </div>
            )}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="block mb-1 text-sm text-gray-500">Company Name</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-black"
                    value={companyInfo.company}
                    onChange={e => setCompanyInfo({ ...companyInfo, company: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block mb-1 text-sm text-gray-500">Company Address</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-black"
                    value={companyInfo.address}
                    onChange={e => setCompanyInfo({ ...companyInfo, address: e.target.value })}
                    required
                  />
                </div>
              </div>
            )}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <label className="block mb-1 text-sm text-gray-500">Password</label>
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
              </div>
            )}
            {error && <p className="text-red-500 mt-4 text-sm">{error}</p>}
            {success && <p className="text-green-600 mt-4 text-sm">{success}</p>}
            <div className="flex justify-between mt-4">
              {step > 0 && (
                <button
                  type="button"
                  className="px-6 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 text-sm"
                  onClick={handleBack}
                >
                  Back
                </button>
              )}
              <button
                type="submit"
                className="px-6 py-2 rounded-lg bg-[#0a61d7] text-white font-medium hover:bg-[#084ba6] ml-auto text-sm disabled:opacity-60"
                disabled={loading}
              >
                {loading ? "Registering..." : step < 2 ? "Next" : "Register"}
              </button>
            </div>
          </div>
        </form>
        {/* Login redirect prompt */}
        <div className="flex items-center mt-4 text-sm">
          <span className="text-gray-500">Already have an account?</span>
          <a href="/login" className="ml-2 text-[#0a61d7] font-semibold hover:underline">Log in here</a>
        </div>
      </div>
      {/* Right: Placeholder for Distribution/Retailing Image */}
      <div className="col-span-5 bg-blue-600 flex items-center justify-center animate-fade-in-right">
        <span className="text-white text-2xl font-bold">[Distribution/Retailing Image Placeholder]</span>
      </div>
    </div>
  );
}
