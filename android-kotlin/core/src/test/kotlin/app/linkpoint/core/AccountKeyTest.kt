package app.linkpoint.core

import app.linkpoint.core.login.AccountKey
import org.junit.Assert.*
import org.junit.Test

class AccountKeyTest {
    @Test fun spellingsOfOneAccountShareAKey() {
        val k = AccountKey.of("agni", "Test Resident")
        assertEquals(k, AccountKey.of("agni", "test.resident"))
        assertEquals(k, AccountKey.of("agni", " Test_Resident "))
        assertEquals(k, AccountKey.of("agni", "test"))
    }
    @Test fun gridsAndAccountsDiffer() {
        assertNotEquals(AccountKey.of("agni", "a b"), AccountKey.of("aditi", "a b"))
        assertNotEquals(AccountKey.of("agni", "a b"), AccountKey.of("agni", "a c"))
    }
}
