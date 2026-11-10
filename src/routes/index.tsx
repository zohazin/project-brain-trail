import { createFileRoute, Link } from "@tanstack/react-router";
import { Armchair, Handshake, MapPin, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoAccounts } from "@/components/app/DemoAccounts";
import { Logo } from "@/components/app/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cheez Udhaar — borrow and lend near you in Multan" },
      {
        name: "description",
        content: "Need chairs, a drill or some glue? Borrow from neighbours nearby, or lend what you have.",
      },
      { property: "og:title", content: "Cheez Udhaar — borrow and lend near you" },
      {
        property: "og:description",
        content: "Borrow from neighbours nearby in Multan, or lend what you have. Write in English or Roman Urdu.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:py-14">
        <Logo />
        <h1 className="mt-10 text-4xl font-bold leading-tight sm:text-5xl">
          Borrow what you need.
          <br />
          <span className="text-primary">Lend what you have.</span>
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Find chairs, tools, glue and more from people near you in Multan. Write the way you talk — in
          English or Roman Urdu.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Get started</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/auth" search={{ mode: "signin" }}>
              I have an account
            </Link>
          </Button>
        </div>

        <ul className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Armchair, t: "Tell us what you need", d: "“Sunday ko 20 kursiyan chahiye” works." },
            { icon: MapPin, t: "We find it nearby", d: "Only people within the distance you choose." },
            { icon: Handshake, t: "Meet and return", d: "Private chat, pickup and return tracking." },
          ].map((f) => (
            <li key={f.t} className="rounded-2xl bg-card p-4 shadow-card">
              <f.icon className="h-7 w-7 text-primary" aria-hidden />
              <h2 className="mt-2 text-lg font-semibold">{f.t}</h2>
              <p className="text-sm text-muted-foreground">{f.d}</p>
            </li>
          ))}
        </ul>

        <div className="mt-12">
          <DemoAccounts />
        </div>

        <p className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
          <MessageCircle className="h-4 w-4" aria-hidden /> Starting with one community: Multan.
        </p>
      </div>
    </main>
  );
}
