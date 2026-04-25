import { useState } from "react";
import AuthCard from "../components/AuthCard.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function SignupPage() {
  const { signup } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await signup(form);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Create your control plane"
      subtitle="Spin up a workspace for AWS-backed frontend and backend deployments."
      submitLabel="Create account"
      footerText="Already have an account?"
      footerLink="/login"
      footerLabel="Login"
      onSubmit={handleSubmit}
      form={form}
      setForm={setForm}
      loading={loading}
      error={error}
      fields={[
        { name: "name", label: "Name", type: "text", placeholder: "Platform owner" },
        { name: "email", label: "Email", type: "email", placeholder: "team@example.com" },
        { name: "password", label: "Password", type: "password", placeholder: "At least 8 characters" }
      ]}
    />
  );
}
