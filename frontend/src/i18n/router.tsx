import { forwardRef, useCallback } from "react";
import {
  Link as RLink,
  NavLink as RNavLink,
  Navigate as RNavigate,
  useNavigate as useRNavigate,
  type LinkProps,
  type NavLinkProps,
  type NavigateOptions,
  type NavigateProps,
  type To,
} from "react-router-dom";
import { useLocale } from "./index";

/* Drop-in náhrada za Link, NavLink, Navigate a useNavigate z react-router-dom.
   Interní adresy (začínající /) dostanou jazykovou předponu a přeložené segmenty,
   takže v kódu zůstává `to="/clanky"` a v angličtině vede na /en/articles. */

export * from "react-router-dom";

function useMap() {
  const { path } = useLocale();
  return useCallback(
    (to: To): To => (typeof to === "string" ? path(to) : to.pathname ? { ...to, pathname: path(to.pathname) } : to),
    [path],
  );
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ to, ...rest }, ref) {
  const map = useMap();
  return <RLink ref={ref} to={map(to)} {...rest} />;
});

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function NavLink({ to, ...rest }, ref) {
  const map = useMap();
  return <RNavLink ref={ref} to={map(to)} {...rest} />;
});

export function Navigate({ to, ...rest }: NavigateProps) {
  const map = useMap();
  return <RNavigate to={map(to)} {...rest} />;
}

export function useNavigate() {
  const navigate = useRNavigate();
  const map = useMap();
  return useCallback((to: To | number, options?: NavigateOptions) => (typeof to === "number" ? navigate(to) : navigate(map(to), options)), [navigate, map]);
}
