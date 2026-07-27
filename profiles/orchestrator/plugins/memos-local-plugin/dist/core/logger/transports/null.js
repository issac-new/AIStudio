/**
 * Silent transport. Used by tests so `rootLogger` still has at least one
 * transport while not polluting test output.
 */
export class NullTransport {
    name = "null";
    accepts(_r) {
        return true;
    }
    write(_r) { }
}
//# sourceMappingURL=null.js.map