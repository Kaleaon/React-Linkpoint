package app.linkpoint.core.scene

/**
 * Names of the joints a Second Life avatar skeleton has, so a rigged mesh can be checked against it. The base skeleton
 * (m* bones) and the collision volumes rigged clothing is usually weighted to; Bento extras (face, wings, tail, fingers
 * beyond the base hand) are not listed and show up as unknown joints, which is informational only.
 */
object AvatarSkeleton {
    val BONES: Set<String> = setOf(
        "mPelvis", "mTorso", "mChest", "mNeck", "mHead", "mSkull", "mEyeRight", "mEyeLeft",
        "mCollarLeft", "mShoulderLeft", "mElbowLeft", "mWristLeft",
        "mCollarRight", "mShoulderRight", "mElbowRight", "mWristRight",
        "mHipRight", "mKneeRight", "mAnkleRight", "mFootRight", "mToeRight",
        "mHipLeft", "mKneeLeft", "mAnkleLeft", "mFootLeft", "mToeLeft",
        "mSpine1", "mSpine2", "mSpine3", "mSpine4", "mGroin", "mHandMiddle1Left", "mHandMiddle1Right",
        "mHandIndex1Left", "mHandIndex1Right", "mHandThumb1Left", "mHandThumb1Right",
    )

    val COLLISION_VOLUMES: Set<String> = setOf(
        "PELVIS", "BACK", "CHEST", "L_CLAVICLE", "R_CLAVICLE", "LEFT_PEC", "RIGHT_PEC", "UPPER_BACK", "LOWER_BACK", "BELLY", "BUTT",
        "LEFT_HANDLE", "RIGHT_HANDLE", "L_UPPER_ARM", "L_LOWER_ARM", "L_HAND", "R_UPPER_ARM", "R_LOWER_ARM", "R_HAND",
        "L_UPPER_LEG", "L_LOWER_LEG", "L_FOOT", "R_UPPER_LEG", "R_LOWER_LEG", "R_FOOT", "NECK", "HEAD",
    )

    fun isKnown(name: String) = name in BONES || name in COLLISION_VOLUMES
}
