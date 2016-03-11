VALID_TOOLCHAINS := pnacl

TARGET = moonlight-chrome

# Include library makefiles
include common-c.mk
include opus.mk
include h264bitstream.mk
include libgamestream.mk
include ports.mk

EXTRA_INC_PATHS := $(EXTRA_INC_PATHS) $(COMMON_C_INCLUDE) $(OPUS_INCLUDE) $(H264BS_INCLUDE) $(LIBGS_C_INCLUDE) $(PORTS_INCLUDE)
EXTRA_LIB_PATHS := $(EXTRA_LIB_PATHS) $(PORTS_LIB_ROOT)

include $(NACL_SDK_ROOT)/tools/common.mk

# Dirty hack to allow 'make serve' to work in this directory
HTTPD_PY := $(HTTPD_PY) --no-dir-check

CHROME_ARGS += --allow-nacl-socket-api=localhost

LIBS = ppapi_gles2 ppapi ppapi_cpp pthread curl z ssl crypto nacl_io

CFLAGS = -Wall $(COMMON_C_C_FLAGS) $(OPUS_C_FLAGS)

SOURCES = \
    $(OPUS_SOURCE)           \
    $(H264BS_SOURCE)         \
    $(COMMON_C_SOURCE)       \
    $(LIBGS_C_SOURCE)        \
    libchelper.c             \
    main.cpp                 \
    input.cpp                \
    gamepad.cpp              \
    connectionlistener.cpp   \
    viddec.cpp               \
    auddec.cpp               \
    http.cpp                 \

# Build rules generated by macros from common.mk:

$(foreach src,$(SOURCES),$(eval $(call COMPILE_RULE,$(src),$(CFLAGS))))

# The PNaCl workflow uses both an unstripped and finalized/stripped binary.
# On NaCl, only produce a stripped binary for Release configs (not Debug).
ifneq (,$(or $(findstring pnacl,$(TOOLCHAIN)),$(findstring Release,$(CONFIG))))
$(eval $(call LINK_RULE,$(TARGET)_unstripped,$(SOURCES),$(LIBS),$(DEPS)))
$(eval $(call STRIP_RULE,$(TARGET),$(TARGET)_unstripped))
else
$(eval $(call LINK_RULE,$(TARGET),$(SOURCES),$(LIBS),$(DEPS)))
endif

$(eval $(call NMF_RULE,$(TARGET),))
