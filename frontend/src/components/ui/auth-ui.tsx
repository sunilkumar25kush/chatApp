"use client";

import * as React from "react";
import { useState, useId, useEffect } from "react";
import { Slot } from "@radix-ui/react-slot";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "../../lib/utils";

export interface TypewriterProps {
  text: string | string[];
  speed?: number;
  cursor?: string;
  loop?: boolean;
  deleteSpeed?: number;
  delay?: number;
  className?: string;
}

export function Typewriter({
  text,
  speed = 100,
  cursor = "|",
  loop = false,
  deleteSpeed = 50,
  delay = 1500,
  className,
}: TypewriterProps) {
  const [displayText, setDisplayText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [textArrayIndex, setTextArrayIndex] = useState(0);

  const textArray = Array.isArray(text) ? text : [text];
  const currentText = textArray[textArrayIndex] || "";

  useEffect(() => {
    if (!currentText) return;

    const timeout = setTimeout(
      () => {
        if (!isDeleting) {
          if (currentIndex < currentText.length) {
            setDisplayText((prev) => prev + currentText[currentIndex]);
            setCurrentIndex((prev) => prev + 1);
          } else if (loop) {
            setTimeout(() => setIsDeleting(true), delay);
          }
        } else {
          if (displayText.length > 0) {
            setDisplayText((prev) => prev.slice(0, -1));
          } else {
            setIsDeleting(false);
            setCurrentIndex(0);
            setTextArrayIndex((prev) => (prev + 1) % textArray.length);
          }
        }
      },
      isDeleting ? deleteSpeed : speed,
    );

    return () => clearTimeout(timeout);
  }, [
    currentIndex,
    isDeleting,
    currentText,
    loop,
    speed,
    deleteSpeed,
    delay,
    displayText,
    text,
    textArray.length,
  ]);

  return (
    <span className={className}>
      {displayText}
      <span className="animate-pulse">{cursor}</span>
    </span>
  );
}

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input dark:border-input/50 bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary-foreground/60 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-12 rounded-md px-6",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-input dark:border-input/50 bg-background px-3 py-3 text-sm text-foreground shadow-sm shadow-black/5 transition-shadow placeholder:text-muted-foreground/70 focus-visible:bg-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export interface PasswordInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, label, ...props }, ref) => {
    const id = useId();
    const [showPassword, setShowPassword] = useState(false);
    const togglePasswordVisibility = () => setShowPassword((prev) => !prev);
    return (
      <div className="grid w-full items-center gap-2">
        {label && <Label htmlFor={id}>{label}</Label>}
        <div className="relative">
          <Input
            id={id}
            type={showPassword ? "text" : "password"}
            className={cn("pe-10", className)}
            ref={ref}
            {...props}
          />
          <button
            type="button"
            onClick={togglePasswordVisibility}
            className="absolute inset-y-0 end-0 flex h-full w-10 items-center justify-center text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthSignUpDetails extends AuthCredentials {
  name: string;
}

interface SignInFormProps {
  onSubmit?: (credentials: AuthCredentials) => void | Promise<void>;
  submitting?: boolean;
  error?: string | null;
}

function SignInForm({ onSubmit, submitting = false, error }: SignInFormProps) {
  const emailId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSignIn = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSubmit?.({ email, password });
  };

  return (
    <form onSubmit={handleSignIn} autoComplete="on" className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Sign in to your account</h1>
        <p className="text-balance text-sm text-muted-foreground">
          Enter your email below to sign in
        </p>
      </div>
      <div className="grid gap-4">
        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <div className="grid gap-2">
          <Label htmlFor={emailId}>Email</Label>
          <Input
            id={emailId}
            name="email"
            type="email"
            placeholder="m@example.com"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={submitting}
          />
        </div>
        <PasswordInput
          name="password"
          label="Password"
          required
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={submitting}
        />
        <Button type="submit" variant="outline" className="mt-2" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign In"}
        </Button>
      </div>
    </form>
  );
}

interface SignUpFormProps {
  onSubmit?: (details: AuthSignUpDetails) => void | Promise<void>;
  submitting?: boolean;
  error?: string | null;
}

function SignUpForm({ onSubmit, submitting = false, error }: SignUpFormProps) {
  const nameId = useId();
  const emailId = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSignUp = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSubmit?.({ name, email, password });
  };

  return (
    <form onSubmit={handleSignUp} autoComplete="on" className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Create an account</h1>
        <p className="text-balance text-sm text-muted-foreground">
          Enter your details below to sign up
        </p>
      </div>
      <div className="grid gap-4">
        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <div className="grid gap-1">
          <Label htmlFor={nameId}>Full Name</Label>
          <Input
            id={nameId}
            name="name"
            type="text"
            placeholder="John Doe"
            required
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={submitting}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={emailId}>Email</Label>
          <Input
            id={emailId}
            name="email"
            type="email"
            placeholder="m@example.com"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={submitting}
          />
        </div>
        <PasswordInput
          name="password"
          label="Password"
          required
          autoComplete="new-password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={submitting}
        />
        <Button type="submit" variant="outline" className="mt-2" disabled={submitting}>
          {submitting ? "Creating account..." : "Sign Up"}
        </Button>
      </div>
    </form>
  );
}

interface AuthFormContainerProps {
  isSignIn: boolean;
  onToggle: () => void;
  onSignIn?: (credentials: AuthCredentials) => void | Promise<void>;
  onSignUp?: (details: AuthSignUpDetails) => void | Promise<void>;
  onGoogleClick?: () => void;
  submitting?: boolean;
  error?: string | null;
  signUpHref?: string;
  signInHref?: string;
  googleSlot?: React.ReactNode;
  brand?: React.ReactNode;
}

function AuthFormContainer({
  isSignIn,
  onToggle,
  onSignIn,
  onSignUp,
  onGoogleClick,
  submitting,
  error,
  signUpHref,
  signInHref,
  googleSlot,
  brand,
}: AuthFormContainerProps) {
  const switchHref = isSignIn ? signUpHref : signInHref;

  return (
    <div className="mx-auto grid w-full max-w-[350px] gap-2">
      {brand}
      {isSignIn ? (
        <SignInForm onSubmit={onSignIn} submitting={submitting} error={error} />
      ) : (
        <SignUpForm onSubmit={onSignUp} submitting={submitting} error={error} />
      )}
      <div className="text-center text-sm">
        {isSignIn ? "Don't have an account?" : "Already have an account?"}{" "}
        {switchHref ? (
          <a
            href={switchHref}
            className={cn(buttonVariants({ variant: "link" }), "pl-1 text-foreground")}
          >
            {isSignIn ? "Sign up" : "Sign in"}
          </a>
        ) : (
          <Button
            variant="link"
            type="button"
            className="pl-1 text-foreground"
            onClick={onToggle}
          >
            {isSignIn ? "Sign up" : "Sign in"}
          </Button>
        )}
      </div>
      <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
        <span className="relative z-10 bg-background px-2 text-muted-foreground">
          Or continue with
        </span>
      </div>
      {googleSlot ?? (
        <Button
          variant="outline"
          type="button"
          onClick={onGoogleClick}
          className="w-full"
        >
          <GoogleIcon className="mr-2 size-4" />
          Continue with Google
        </Button>
      )}
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.19 7.19 0 0 1 0-4.58V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

export interface AuthContentProps {
  image?: {
    src: string;
    alt: string;
  };
  quote?: {
    text: string;
    author: string;
  };
}

export interface AuthUIProps {
  signInContent?: AuthContentProps;
  signUpContent?: AuthContentProps;
  initialMode?: "signin" | "signup";
  /** Use the full viewport height (default) or leave room for a 68px navbar. */
  fullHeight?: boolean;
  className?: string;
  submitting?: boolean;
  error?: string | null;
  onSignIn?: (credentials: AuthCredentials) => void | Promise<void>;
  onSignUp?: (details: AuthSignUpDetails) => void | Promise<void>;
  onToggle?: (mode: "signin" | "signup") => void;
  signUpHref?: string;
  signInHref?: string;
  googleSlot?: React.ReactNode;
  onGoogleClick?: () => void;
  brand?: React.ReactNode;
}

const defaultSignInContent = {
  image: {
    src: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1600&q=80",
    alt: "A team collaborating around a table",
  },
  quote: {
    text: "Welcome back. Your rooms are waiting.",
    author: "ChatRoom",
  },
};

const defaultSignUpContent = {
  image: {
    src: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1600&q=80",
    alt: "A group of people starting something new together",
  },
  quote: {
    text: "Create an account. A new chapter awaits.",
    author: "ChatRoom",
  },
};

export function AuthUI({
  signInContent = {},
  signUpContent = {},
  initialMode = "signin",
  fullHeight = true,
  className,
  submitting,
  error,
  onSignIn,
  onSignUp,
  onToggle,
  signUpHref,
  signInHref,
  googleSlot,
  onGoogleClick,
  brand,
}: AuthUIProps) {
  const [isSignIn, setIsSignIn] = useState(initialMode !== "signup");

  const toggleForm = () => {
    setIsSignIn((prev) => {
      const next = !prev;
      onToggle?.(next ? "signin" : "signup");
      return next;
    });
  };

  const finalSignInContent = {
    image: { ...defaultSignInContent.image, ...signInContent.image },
    quote: { ...defaultSignInContent.quote, ...signInContent.quote },
  };
  const finalSignUpContent = {
    image: { ...defaultSignUpContent.image, ...signUpContent.image },
    quote: { ...defaultSignUpContent.quote, ...signUpContent.quote },
  };

  const currentContent = isSignIn ? finalSignInContent : finalSignUpContent;

  return (
    <div className="auth-ui-root">
      <div
        className={cn(
          "w-full bg-background text-foreground md:grid md:grid-cols-2",
          fullHeight ? "min-h-screen" : "min-h-[calc(100dvh-68px)]",
          className,
        )}
      >
        <style>{`
          input[type="password"]::-ms-reveal,
          input[type="password"]::-ms-clear {
            display: none;
          }
        `}</style>
        <div className="auth-ui-form-column flex min-h-[inherit] items-center justify-center p-6 md:min-h-0 md:py-12">
          <AuthFormContainer
            isSignIn={isSignIn}
            onToggle={toggleForm}
            onSignIn={onSignIn}
            onSignUp={onSignUp}
            onGoogleClick={onGoogleClick}
            submitting={submitting}
            error={error}
            signUpHref={signUpHref}
            signInHref={signInHref}
            googleSlot={googleSlot}
            brand={brand}
          />
        </div>

        <div
          className="auth-ui-media relative hidden bg-cover bg-center transition-all duration-500 ease-in-out md:block md:min-h-[560px]"
          style={{ backgroundImage: `url(${currentContent.image.src})` }}
          key={currentContent.image.src}
          role="img"
          aria-label={currentContent.image.alt}
        >
          <div className="absolute inset-x-0 bottom-0 z-[1] h-[180px] bg-gradient-to-t from-background to-transparent" />

          <div className="relative z-10 flex h-full flex-col items-center justify-end p-2 pb-6">
            <blockquote className="space-y-2 text-center text-white">
              <p className="text-lg font-medium">
                &ldquo;
                <Typewriter
                  key={currentContent.quote.text}
                  text={currentContent.quote.text}
                  speed={60}
                />
                &rdquo;
              </p>
              <cite className="block text-sm font-light not-italic text-white/80">
                — {currentContent.quote.author}
              </cite>
            </blockquote>
          </div>
        </div>
      </div>
    </div>
  );
}

export { Button, Input, Label, PasswordInput };
