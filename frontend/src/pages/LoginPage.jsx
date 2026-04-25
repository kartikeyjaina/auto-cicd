import { useState } from "react";
import AuthCard from "../components/AuthCard.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function LoginPage() {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await login(form);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Authenticate, pick a repo, and ship it through the deployment worker."
      submitLabel="Login"
      footerText="Need an account?"
      footerLink="/signup"
      footerLabel="Create one"
      onSubmit={handleSubmit}
      form={form}
      setForm={setForm}
      loading={loading}
      error={error}
      fields={[
        { name: "email", label: "Email", type: "email", placeholder: "team@example.com" },
        { name: "password", label: "Password", type: "password", placeholder: "••••••••" }
      ]}
    />
  );
}
