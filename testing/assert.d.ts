import original from "assert";

interface ErrorCheck {
	name: string
	message: string
}

interface ErrorFn {
	(err: Error): boolean
}

type StringOrError = string | Error;
type AssertionError = ErrorCheck | ErrorFn;

declare namespace assert {
	function deepStrictEqual(actual: any, expected: any, message?: StringOrError): void
	function strictEqual(actual: any, expected: any, message?: StringOrError): void
	function rejects(fn: any, e: AssertionError): void
}

export = assert;