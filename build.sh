#!/bin/bash

rm -rf .build
declare -a StringArray=("hello-world")

for val in ${StringArray[@]}; do
    echo "building $val"
    GOOS=linux go build -o .build/$val/handler ./myapp/$val
done
