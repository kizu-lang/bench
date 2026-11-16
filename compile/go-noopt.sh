#!/usr/bin/env bash
exec go build -gcflags="all=-N -l" "$@"
