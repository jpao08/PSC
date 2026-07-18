import { NextResponse } from "next/server";
import { AuthenticationError, AuthorizationError, DomainError, NotFoundError, ValidationError } from "@/core/domain/models";

export function jsonError(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "Erro inesperado.";
  if (error instanceof AuthenticationError) return NextResponse.json({ detail: message }, { status: 401 });
  if (error instanceof AuthorizationError) return NextResponse.json({ detail: message }, { status: 403 });
  if (error instanceof NotFoundError) return NextResponse.json({ detail: message }, { status: 404 });
  if (error instanceof ValidationError) return NextResponse.json({ detail: message }, { status: 422 });
  if (error instanceof DomainError) return NextResponse.json({ detail: message }, { status: 400 });
  return NextResponse.json({ detail: message }, { status: 500 });
}
