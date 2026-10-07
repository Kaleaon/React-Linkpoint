import React, { useId } from "react";
import { useTheme } from "../context/ThemeContext.jsx";

/**
 * @param {object} props
 * @param {React.ReactNode} [props.label]
 * @param {React.ReactNode} [props.error]
 * @param {React.ReactNode} [props.helpText]
 * @param {React.ReactNode} [props.children]
 * @param {React.CSSProperties} [props.style]
 */
export default function FormField({
  label = undefined,
  error = undefined,
  helpText = undefined,
  children = undefined,
  style = undefined,
}) {
  const theme = useTheme();
  const V = theme?.V || {};
  const typography = theme?.t || {};
  const fontStyle = typography.font || "sans-serif";

  const fieldId = useId();
  const hasError = Boolean(error);

  const childId = React.isValidElement(children) && children.props.id ? children.props.id : fieldId;
  const errorId = `${childId}-error`;
  const helpId = `${childId}-help`;

  const describedBy = [
    helpText ? helpId : null,
    hasError ? errorId : null,
  ].filter(Boolean).join(" ") || undefined;

  const childWithAria = React.isValidElement(children)
    ? React.cloneElement(children, {
        id: childId,
        "aria-invalid": hasError ? "true" : undefined,
        "aria-errormessage": hasError ? errorId : undefined,
        "aria-describedby": children.props["aria-describedby"]
          ? `${children.props["aria-describedby"]} ${describedBy || ""}`.trim()
          : describedBy,
      })
    : children;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>
      {label ? (
        <label htmlFor={childId} style={{ font: `600 10px/1 ${fontStyle}`, letterSpacing: ".16em", color: V.pri }}>
          {label}
        </label>
      ) : null}
      {childWithAria}
      {helpText ? (
        <small id={helpId} style={{ color: V.ink2, fontSize: 11 }}>
          {helpText}
        </small>
      ) : null}
      {hasError ? (
        <div id={errorId} role="alert" style={{ color: V.err || "#ff4d4d", fontSize: 12, marginTop: 2 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
