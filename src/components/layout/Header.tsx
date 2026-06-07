"use client";

import clsx from "clsx";
import { Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { navItems, siteConfig } from "@/lib/seo/site";
import styles from "./Header.module.css";

export function Header() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label={`${siteConfig.name} home`}>
          <span className={styles.logo} aria-hidden="true">
            GC
          </span>
          <span>{siteConfig.name}</span>
        </Link>

        <nav className={styles.desktopNav} aria-label="Primary navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(styles.navLink, pathname === item.href && styles.active)}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Link href="/analysis/" className={styles.cta}>
          <Search size={18} aria-hidden="true" />
          Analyze
        </Link>

        <button
          type="button"
          className={styles.menuButton}
          aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((value) => !value)}
        >
          {isOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
      </div>

      <nav className={clsx(styles.mobileNav, isOpen && styles.mobileNavOpen)} aria-label="Mobile navigation">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={styles.mobileLink}
            onClick={() => setIsOpen(false)}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
