import { render, screen } from "@testing-library/react";

import { AuthFormField } from "./auth-form-field";

describe("auth form field", () => {
  it(
    "renders the label and error state with shadcn field primitives",
    {
      timeout: 1000,
    },
    () => {
      render(
        <AuthFormField
          label="Email"
          htmlFor="email"
          invalid
          errorText="Email is required"
        >
          <input id="email" aria-invalid />
        </AuthFormField>
      );

      expect(screen.getByText("Email")).toBeInTheDocument();
      expect(screen.getByText("Email is required")).toBeInTheDocument();
      expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid");
    }
  );
});
